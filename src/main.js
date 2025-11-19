import { Actor } from 'apify';
import axios from 'axios';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL_PRICING = {
    'anthropic/claude-3.5-sonnet': { input: 3.00, output: 15.00 },
    'openai/gpt-4o': { input: 2.50, output: 10.00 },
    'google/gemini-2.0-flash-exp:free': { input: 0, output: 0 }
};

await Actor.main(async () => {
    const input = await Actor.getInput();

    if (!input?.text) throw new Error('Text is required');
    if (!input?.openrouterApiKey) throw new Error('OpenRouter API key is required');

    const {
        text,
        length = 'medium',
        format = 'paragraph',
        includeKeyPoints = true,
        model = 'anthropic/claude-3.5-sonnet',
        openrouterApiKey
    } = input;

    const wordCounts = { short: 75, medium: 175, long: 350 };
    const targetWords = wordCounts[length];

    console.log(`Summarizing ${countWords(text)} words to ~${targetWords} words...`);

    const prompt = buildSummaryPrompt(text, targetWords, format, includeKeyPoints);
    const result = await callOpenRouter(prompt, model, openrouterApiKey);
    const summary = JSON.parse(result.content);
    const cost = calculateCost(result.usage, model);

    const output = {
        originalText: text,
        originalWordCount: countWords(text),
        summary: summary.summary,
        keyPoints: summary.keyPoints || [],
        mainTopics: summary.mainTopics || [],
        summaryWordCount: countWords(summary.summary),
        compressionRatio: `${(countWords(text) / countWords(summary.summary)).toFixed(1)}:1`,
        format,
        length,
        model,
        cost: parseFloat(cost.totalCost.toFixed(6)),
        chargePrice: 0.50,
        profit: parseFloat((0.50 - cost.totalCost).toFixed(4)),
        summarizedAt: new Date().toISOString()
    };

    await Actor.pushData(output);
    console.log(`✓ Summary created: ${output.summaryWordCount} words (${output.compressionRatio} compression)`);
});

function buildSummaryPrompt(text, targetWords, format, includeKeyPoints) {
    const formatInstructions = {
        paragraph: 'as a cohesive, flowing paragraph',
        bullets: 'as clear bullet points',
        abstract: 'as an academic-style abstract with background, methods, and conclusions'
    };

    return `Summarize the following text in approximately ${targetWords} words, formatted ${formatInstructions[format]}.

Article:
${text}

Provide:
1. Concise summary
${includeKeyPoints ? '2. 3-5 key takeaway points' : ''}
3. Main topics/themes covered

Return JSON:
{
    "summary": "the summarized text",
    "keyPoints": ["point 1", "point 2", "point 3"],
    "mainTopics": ["topic1", "topic2"]
}`;
}

async function callOpenRouter(prompt, model, apiKey) {
    const response = await axios.post(OPENROUTER_API_URL, {
        model,
        messages: [
            { role: 'system', content: 'You are an expert at analyzing and summarizing content concisely and accurately.' },
            { role: 'user', content: prompt }
        ],
        temperature: 0.5,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
    }, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://apify.com',
            'X-Title': 'Apify Article Summarizer'
        }
    });
    return { content: response.data.choices[0].message.content, usage: response.data.usage };
}

function calculateCost(usage, model) {
    const pricing = MODEL_PRICING[model];
    return {
        totalCost: (usage.prompt_tokens / 1000000) * pricing.input + (usage.completion_tokens / 1000000) * pricing.output
    };
}

function countWords(text) {
    return text.replace(/<[^>]*>/g, '').split(/\s+/).filter(w => w.length > 0).length;
}

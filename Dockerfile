FROM apify/actor-node:22
COPY package*.json ./
RUN npm --quiet set progress=false && npm install --only=prod --no-optional && rm -r ~/.npm
COPY . ./
CMD npm start --silent

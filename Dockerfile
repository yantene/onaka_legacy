FROM node:latest

ENV BOT_HOME /bot

RUN mkdir $BOT_HOME
WORKDIR $BOT_HOME

ADD ./package.json $BOT_HOME/
RUN npm install

ADD . $BOT_HOME

CMD ["bin/hubot", "--adapter", "slack"]

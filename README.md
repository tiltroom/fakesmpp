
fakesmpp

========


Simple fake SMPP server based on node.js smpp package

__The app supports ESME complinat auth, ACK and responses.__


## Settings
Refer to settings object in app.js
## Logs
Pino looger, console only


# Install
Note: This project uses yarn instead of npm.

## Classic
```
git clone https://github.com/tiltroom/fakesmpp.git
cd fakesmpp
yarn install
```

Start the app with default setting with one of the commands below:
```
yarn start
node app.js
```

## Docker
```
git clone https://github.com/tiltroom/fakesmpp.git
cd fakesmpp
docker build .
docker run -p [port of choice]:2775 -d [build hash]
```
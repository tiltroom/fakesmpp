
fakesmpp

========


Simple fake SMPP server based on node.js smpp package

__The app supports ESME complinat auth, ACK and responses.__


## Auth
_--system_id [your-username]_
_--password [your-password]_

By default __system_id=username__ and __password=password__


## Port
_--port [port]_

By default __port=2775__


## Status
_--status [status]_
A full list is available in __smpp.js__

By default __status=delivered__


## Delays
_--ddmin [seconds for minimum delay]_
_--ddmax [seconds for maximum delay]_

By default __ddmin=0__ and __ddmax=0__


## Logs
Logs are saved in __/var/log/fakesmpp.log__ and app console.


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
node smpp.js
```

Start the app with custom settings (all the params are optional):
```
node smpp.js --port [port] --ddmin [s] --ddmax [s] --status [status] --system_id [username] --password [password]
```


## Docker
```
git clone https://github.com/tiltroom/fakesmpp.git
cd fakesmpp
docker build .
docker run -p [port of choice]:2775 -d [build hash]
```
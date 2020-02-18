fakesmpp
========

Simple fake SMPP server based on node.js smpp package (https://www.npmjs.com/package/smpp). By default server listen port 2775. It able to authorize
ESME (by default system_id=user and password=pass, but you can use --auth option to set up your own parameters). By default server request ESME with deliver_sm 
(message delivered) successed just after submit_sm request from ESME, but you can manage time delay and statuses of the answer.

Required node v12.4.0 packages:

- smpp 0.4.0 -- SMPP realisation 
- winston 3.2.1 -- logging
- strftime 0.10.0 -- date format
- optimist 0.6.1 -- command options

##Install

```bash
git clone https://github.com/tiltroom/fakesmpp.git
cd [folder with fakesmpp code]
yarn install
```

##Usage
1. Listen 2775 port and always answer Ok status (DELIVRD) and authorize user (service_id) with pass password
```bash
node smpp.js
```
2. Listen 9999 port with delay between 5 and 10 seconds for message delivered (deliver_sm) request to ESME and return iterated one by one statuses (delivered, then status expired, then delivered again and so on). u1 (service_id) with password pass1 and u2 with password pass2 will be authorized on SMPP server.
You can find available status values list in statuses.js.
```bash
node smpp.js --port=2775 --ddmin=5000 --ddmax=10000 --auth=user:pass,u1:pass1,u2:pass2 --statuses=delivered,expired,spam_rejected
```

##Docker
1. cd [folder with fakesmpp code]
2. ```bash 
docker build .
```
2. ```bash 
docker run -p [port of choice]:2775 -d [image hash obtained from buid]
```
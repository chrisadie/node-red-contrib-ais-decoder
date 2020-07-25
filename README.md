# node-red-contrib-ais-decoder
A Node-Red node to decode AIS message strings

## Introduction
The automatic identification system (AIS) is an automatic tracking system that uses transponders on ships. AIS is intended, primarily, to allow ships to view marine traffic in their area and to be seen by that traffic. Further information is available in [Wikipedia](https://en.wikipedia.org/wiki/Automatic_identification_system).

This node accepts AIS messages as input, decodes them, and presents the decoded data at the output. It is mainly intended for use with the [rtl-ais](https://github.com/dgiardini/rtl-ais) software, though it can easily be used in other contexts - e.g. as an online AIS decoder like [this one](http://ais.tbsalling.dk).

***This software must not be used for navigation!***

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-ais-decoder
```
You will find a new node **ais decoder** in the 'parser' pallette of the node-red editor.

## Usage

### Input
The input is a stream of AIS messages. There can be multiple AIS messages within a single node-red message payload, as long as they are separated by CR characters.

If you are using the [rtl-ais](https://github.com/dgiardini/rtl-ais) software, you should connect the input of this ais decoder node to a **udp in** node, configured to listen on port 10110 (the default for rtl-ais).

There are two output ports:

1. A "decode" port, which emits messages containing decoded AIS information
2. An "error" port, which emits error messages when an input message cannot be decoded

This version only decodes the following AIS message types: 1, 2, 3, 5, 9, 18, 19. Future versions may do more.

### Output
The payload of an output message is an object containing the decoded or error information. See [output-spec.pdf](output-spec.pdf) for more information.

## Example Flows

### Live AIS data recorder
This flow listens on port 10110 for UDP packets from the rtl-ais software. It decodes the packets and stores the decoded information in JSON format in a local file.

If an erroneous packet is detected, a message is logged in the node-red debugger.

```
[{"id":"bd99be41.16e01","type":"tab","label":"RTL-AIS","disabled":false,"info":""},{"id":"88e32bce.f600b8","type":"udp in","z":"bd99be41.16e01","name":"rtl-ais","iface":"","port":"10110","ipv":"udp4","multicast":"false","group":"","datatype":"utf8","x":160,"y":160,"wires":[["a54ead5.d1139d"]]},{"id":"a54ead5.d1139d","type":"ais-decoder","z":"bd99be41.16e01","name":"","x":330,"y":160,"wires":[["3bb49be2.69784c"],["4743f938.29ecb"]]},{"id":"3bb49be2.69784c","type":"file","z":"bd99be41.16e01","name":"Live output file","filename":"/home/pi/node-red-contrib-ais-decoder/live-output.json","appendNewline":true,"createDir":true,"overwriteFile":"false","encoding":"none","x":580,"y":140,"wires":[[]]},{"id":"4743f938.29ecb","type":"debug","z":"bd99be41.16e01","name":"Error","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"payload","targetType":"msg","x":550,"y":180,"wires":[]},{"id":"d5c86b82.6d0ac8","type":"comment","z":"bd99be41.16e01","name":"","info":"# Live AIS data recorder\n# \nThis flow listens on port 10110 for UDP packets from the rtl-ais software. It decodes the packets and stores the decoded information in JSON format in a local file.\n\nIf an erroneous packet is detected, a message is logged in the node-red debugger.\n","x":180,"y":80,"wires":[]}]
```

### AIS decoder test
This flow reads AIS messages from a file and records the output in JSON format in another file. Click the button on the `timestamp` node to start.

If an erroneous packet is detected, a message is logged in the node-red debugger.

```
[{"id":"14bdb17a.99661f","type":"tab","label":"AIS Decoder Test","disabled":false,"info":""},{"id":"7bdf820b.1b9934","type":"file in","z":"14bdb17a.99661f","name":"Example file","filename":"/home/pi/node-red-contrib-ais-decoder/ais-example","format":"lines","chunk":false,"sendError":false,"encoding":"none","x":290,"y":180,"wires":[["497583d2.20533c"]]},{"id":"14bf5c85.ae32b3","type":"inject","z":"14bdb17a.99661f","name":"","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":120,"y":180,"wires":[["7bdf820b.1b9934"]]},{"id":"497583d2.20533c","type":"ais-decoder","z":"14bdb17a.99661f","name":"","x":490,"y":180,"wires":[["45323864.e0f8e"],["461bb985.6c9258"]]},{"id":"461bb985.6c9258","type":"debug","z":"14bdb17a.99661f","name":"Error","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"payload","targetType":"msg","x":750,"y":220,"wires":[]},{"id":"45323864.e0f8e","type":"file","z":"14bdb17a.99661f","name":"Output file","filename":"/home/pi/node-red-contrib-ais-decoder/example-output.json","appendNewline":true,"createDir":true,"overwriteFile":"false","encoding":"none","x":770,"y":140,"wires":[[]]}]
```

### AIS online decoder
This flow reads an AIS message from a web input form and displays the output in your browser. Go to http://your.own.ip.address:1880/aisdecode then enter an AIS message and click Submit.

```
[{"id":"f6755db8.da6748","type":"tab","label":"Web decoder","disabled":false,"info":""},{"id":"98f91458.4933d","type":"template","z":"f6755db8.da6748","name":"Input form","field":"payload","fieldType":"msg","format":"handlebars","syntax":"mustache","template":"<!DOCTYPE html>\n<html>\n<body>\n\n<h1>Simple online AIS decoder</h1>\n<p>Enter an AIS message, then click \"Submit.<br>\nExample message: !AIVDM,1,1,,B,33P7k`@Oi?wVpv0PB7@=`bw`00pA,0*7B</p>\n\n<form action=\"/aisdecode\">\n<textarea name=\"message\" rows=\"10\" cols=\"100\"></textarea><br>\n<input type=\"submit\" value=\"Submit\">\n</form>\n</body>\n</html>","output":"str","x":770,"y":260,"wires":[["24738581.8f23f2"]]},{"id":"24738581.8f23f2","type":"http response","z":"f6755db8.da6748","name":"","statusCode":"","headers":{},"x":950,"y":200,"wires":[]},{"id":"44787b67.025ed4","type":"ais-decoder","z":"f6755db8.da6748","name":"","x":590,"y":180,"wires":[["969b4057.05a828"],["a6ae6b68.96b3"]]},{"id":"bb9b126d.0c53e","type":"function","z":"f6755db8.da6748","name":"Trim","func":"msg.payload = msg.payload.message.trim();\nreturn msg;","outputs":1,"noerr":0,"x":430,"y":180,"wires":[["44787b67.025ed4"]]},{"id":"969b4057.05a828","type":"template","z":"f6755db8.da6748","name":"Results page","field":"payload","fieldType":"msg","format":"handlebars","syntax":"mustache","template":"<!DOCTYPE html>\n<html>\n<head>\n<style>\ntable, th, td {\n  border: 1px solid black;\n  border-collapse: collapse;\n  padding: 15px;\n  text-align: left;\n}\n</style>\n</head>\n\n<body>\n\n<h1>Decoded messages</h1>\n\n<p><a href=\"/aisdecode\">Back to input form</a>.</p>\n\n<table style=\\\"width:50%\\\">\n<tr><td>Original AIS message:</td><td style=\"font-family:courier;\">{{payload.aisOriginal}}</td></tr>\n<tr><td>Message type:</td><td>{{payload.aisType}}</td></tr>\n<tr><td>Vessel name:</td><td>{{payload.aisName}}</td></tr>\n<tr><td>Mobile Marine Service identifier:</td><td>{{payload.aisMmsi}}</td></tr>\n<tr><td>Latitude:</td><td>{{payload.aisLatitude}}</td></tr>\n<tr><td>Longitude:</td><td>{{payload.aisLongitude}}</td></tr>\n<tr><td>Speed over ground:</td><td>{{payload.aisSpeedOverGround}}</td></tr>\n<tr><td>Course over ground:</td><td>{{payload.aisCourseOverGround}}</td></tr>\n</table\n</body>\n</html>","output":"str","x":770,"y":140,"wires":[["24738581.8f23f2"]]},{"id":"d13c6e34.0b70e","type":"comment","z":"f6755db8.da6748","name":"Online AIS decoder","info":"Go to http://your.own.ip.address:1880/aisdecode then enter an AIS message and click Submit.","x":130,"y":140,"wires":[]},{"id":"a6ae6b68.96b3","type":"template","z":"f6755db8.da6748","name":"Error page","field":"payload","fieldType":"msg","format":"handlebars","syntax":"mustache","template":"<!DOCTYPE html>\n<html>\n<head>\n<style>\ntable, th, td {\n  border: 1px solid black;\n  border-collapse: collapse;\n  padding: 15px;\n  text-align: left;\n}\n</style>\n</head>\n\n<body>\n\n<h1>Error decoding message</h1>\n\n<p><a href=\"/aisdecoder\">Back to input form</a>.</p>\n\n<table style=\\\"width:30%\\\">\n<tr><td>Original AIS message:</td><td style=\"font-family:courier;\">{{payload.aisOriginal}}</td></tr>\n<tr><td>Decode error:</td><td>{{payload.aisError}}</td></tr>\n</table>\n</body>\n</html>","output":"str","x":770,"y":200,"wires":[["24738581.8f23f2"]]},{"id":"268040fc.eece4","type":"switch","z":"f6755db8.da6748","name":"","property":"payload","propertyType":"msg","rules":[{"t":"nempty"},{"t":"else"}],"checkall":"true","repair":false,"outputs":2,"x":290,"y":220,"wires":[["bb9b126d.0c53e"],["98f91458.4933d"]]},{"id":"1ad9cc4e.a321dc","type":"http in","z":"f6755db8.da6748","name":"","url":"/aisdecode","method":"get","upload":false,"swaggerDoc":"","x":120,"y":220,"wires":[["268040fc.eece4"]]}]
```

## References

1. (Wikipedia article on AIS)[https://en.wikipedia.org/wiki/Automatic_identification_system]
2. Software to receive AIS messages through an RTL-SDR radio dongle)[https://github.com/dgiardini/rtl-ais]
3. (AIVDM/AIVDO protocol decoding)[https://gpsd.gitlab.io/gpsd/AIVDM.html] by Eric S. Raymond - full description of AIS message format
4. (GitHub - the node's github repository)[https://github.com/chrisadie/node-red-contrib-ais-decoder]


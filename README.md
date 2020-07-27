# node-red-contrib-ais-decoder
A Node-Red node to decode AIS message strings

## Introduction
The automatic identification system (AIS) is an automatic tracking system that uses transponders on ships. AIS is intended, primarily, to allow ships to view marine traffic in their area and to be seen by that traffic. Further information is available in [Wikipedia](https://en.wikipedia.org/wiki/Automatic_identification_system).

This node accepts AIS messages as input, decodes them, and presents the decoded data at the output. It is mainly intended for use with the [rtl-ais](https://github.com/dgiardini/rtl-ais) software, though it can easily be used in other contexts - e.g. as an online AIS decoder like [this one](http://ais.tbsalling.dk).

***It is a condition of use of this software that it shall not be relied on in a safety-critical application, such as for marine navigation.***

## Install
Run the following npm command in your Node-RED user directory (typically `~/.node-red`):
```
npm install node-red-contrib-ais-decoder
```
You will find a new node **`ais decoder`** in the 'parser' pallette of the node-red editor.

## Usage

### Input
The input is a stream of AIS messages. There must be no more than one AIS message per node-red message.

Some AIS messages have multiple parts. Each part should be in its own node-red message, and the parts should be presented in sequence. The ais-decoder will accumulate the parts untill all parts have been received before outputting the decoded information.

This version only decodes the following AIS message types: 1, 2, 3, 5, 9, 18, 19. Future versions may do more.

### Output
The payload of an output message is an object containing the decoded data or error information. See [output-spec.pdf](output-spec.pdf) for more information.

## Example Flows

### Live AIS data recorder
This flow listens on port 10110 for UDP packets from the rtl-ais software. It decodes the packets and stores the decoded information in JSON format in a local file.

If an erroneous packet is detected, a message is logged in the node-red debugger.

```
[
    {
        "id": "bd99be41.16e01",
        "type": "tab",
        "label": "RTL-AIS",
        "disabled": false,
        "info": ""
    },
    {
        "id": "88e32bce.f600b8",
        "type": "udp in",
        "z": "bd99be41.16e01",
        "name": "rtl-ais",
        "iface": "",
        "port": "10110",
        "ipv": "udp4",
        "multicast": "false",
        "group": "",
        "datatype": "utf8",
        "x": 150,
        "y": 160,
        "wires": [
            [
                "51696a9f.be3804"
            ]
        ]
    },
    {
        "id": "a54ead5.d1139d",
        "type": "ais-decoder",
        "z": "bd99be41.16e01",
        "name": "",
        "x": 450,
        "y": 160,
        "wires": [
            [
                "c4b8de59.2cf9f"
            ]
        ]
    },
    {
        "id": "3bb49be2.69784c",
        "type": "file",
        "z": "bd99be41.16e01",
        "name": "Live output file",
        "filename": "/home/pi/node-red-contrib-ais-decoder/live-output.json",
        "appendNewline": true,
        "createDir": true,
        "overwriteFile": "false",
        "encoding": "none",
        "x": 780,
        "y": 140,
        "wires": [
            []
        ]
    },
    {
        "id": "d5c86b82.6d0ac8",
        "type": "comment",
        "z": "bd99be41.16e01",
        "name": "Live AIS",
        "info": "# Live AIS data recorder\n# \nThis flow listens on port 10110 for UDP packets from the rtl-ais software. It decodes the packets and stores the decoded information in JSON format in a local file.\n\nIf an erroneous packet is detected, a message is logged in the node-red debugger.\n",
        "x": 160,
        "y": 100,
        "wires": []
    },
    {
        "id": "51696a9f.be3804",
        "type": "split",
        "z": "bd99be41.16e01",
        "name": "",
        "splt": "\\r",
        "spltType": "str",
        "arraySplt": 1,
        "arraySpltType": "len",
        "stream": false,
        "addname": "",
        "x": 290,
        "y": 160,
        "wires": [
            [
                "a54ead5.d1139d"
            ]
        ],
        "info": "If the datagram from rtl-ais contains multiple AIS message fragments, split them into individual node-red messages."
    },
    {
        "id": "c4b8de59.2cf9f",
        "type": "switch",
        "z": "bd99be41.16e01",
        "name": "",
        "property": "payload.resultCode",
        "propertyType": "msg",
        "rules": [
            {
                "t": "eq",
                "v": "0",
                "vt": "num"
            },
            {
                "t": "eq",
                "v": "1",
                "vt": "num"
            },
            {
                "t": "eq",
                "v": "2",
                "vt": "num"
            },
            {
                "t": "else"
            }
        ],
        "checkall": "true",
        "repair": false,
        "outputs": 4,
        "x": 610,
        "y": 160,
        "wires": [
            [
                "3bb49be2.69784c"
            ],
            [],
            [],
            [
                "6b2524e.b6d2b5c"
            ]
        ]
    },
    {
        "id": "6b2524e.b6d2b5c",
        "type": "debug",
        "z": "bd99be41.16e01",
        "name": "Error",
        "active": true,
        "tosidebar": true,
        "console": false,
        "tostatus": false,
        "complete": "payload",
        "targetType": "msg",
        "x": 750,
        "y": 180,
        "wires": []
    }
]
```

### AIS decoder test
This flow reads AIS messages from a file and records the output in JSON format in another file. Click the button on the `timestamp` node to start.

```
[
    {
        "id": "14bdb17a.99661f",
        "type": "tab",
        "label": "AIS Decoder Test",
        "disabled": false,
        "info": ""
    },
    {
        "id": "7bdf820b.1b9934",
        "type": "file in",
        "z": "14bdb17a.99661f",
        "name": "Example file",
        "filename": "/home/pi/node-red-contrib-ais-decoder/ais-example",
        "format": "lines",
        "chunk": false,
        "sendError": false,
        "encoding": "none",
        "x": 290,
        "y": 180,
        "wires": [
            [
                "497583d2.20533c"
            ]
        ]
    },
    {
        "id": "14bf5c85.ae32b3",
        "type": "inject",
        "z": "14bdb17a.99661f",
        "name": "",
        "topic": "",
        "payload": "",
        "payloadType": "date",
        "repeat": "",
        "crontab": "",
        "once": false,
        "onceDelay": 0.1,
        "x": 120,
        "y": 180,
        "wires": [
            [
                "7bdf820b.1b9934"
            ]
        ]
    },
    {
        "id": "497583d2.20533c",
        "type": "ais-decoder",
        "z": "14bdb17a.99661f",
        "name": "",
        "x": 470,
        "y": 180,
        "wires": [
            [
                "45323864.e0f8e"
            ]
        ]
    },
    {
        "id": "45323864.e0f8e",
        "type": "file",
        "z": "14bdb17a.99661f",
        "name": "Output file",
        "filename": "/home/pi/node-red-contrib-ais-decoder/example-output.json",
        "appendNewline": true,
        "createDir": true,
        "overwriteFile": "false",
        "encoding": "none",
        "x": 650,
        "y": 180,
        "wires": [
            []
        ]
    }
]
```

### AIS online decoder
This flow reads one or more AIS messages from a web input form and displays the output in your browser. Go to http://your.own.ip.address:1880/aisdecode then enter an AIS message and click Decode.

```
[
    {
        "id": "f6755db8.da6748",
        "type": "tab",
        "label": "Web decoder",
        "disabled": false,
        "info": ""
    },
    {
        "id": "24738581.8f23f2",
        "type": "http response",
        "z": "f6755db8.da6748",
        "name": "",
        "statusCode": "",
        "headers": {},
        "x": 1010,
        "y": 320,
        "wires": []
    },
    {
        "id": "44787b67.025ed4",
        "type": "ais-decoder",
        "z": "f6755db8.da6748",
        "name": "",
        "x": 650,
        "y": 140,
        "wires": [
            [
                "a78766c5.f4b24"
            ]
        ]
    },
    {
        "id": "bb9b126d.0c53e",
        "type": "function",
        "z": "f6755db8.da6748",
        "name": "Trim",
        "func": "if (msg.payload.message) {\n    msg.payload = msg.payload.message.trim();\n} else msg.payload = \"\";\nreturn msg;",
        "outputs": 1,
        "noerr": 0,
        "x": 310,
        "y": 140,
        "wires": [
            [
                "690d0dbe.6270f4"
            ]
        ]
    },
    {
        "id": "969b4057.05a828",
        "type": "template",
        "z": "f6755db8.da6748",
        "name": "Results table",
        "field": "payload",
        "fieldType": "msg",
        "format": "handlebars",
        "syntax": "mustache",
        "template": "<table style=\\\"width:50%\\\">\n<tr><td>Original AIS message:</td><td style=\"font-family:courier;\">{{payload.aisOriginal}}</td></tr>\n<tr><td>Message type:</td><td>{{payload.aisType}}</td></tr>\n<tr><td>Repeat indicator:</td><td>{{payload.aisRepeatIndicator}}</td></tr>\n<tr><td>Mobile Marine Service identifier:</td><td>{{payload.aisMmsi}}</td></tr>\n<tr><td>Navigation status:</td><td>{{payload.aisNavigationStatus}}</td></tr>\n<tr><td>Vessel name:</td><td>{{payload.aisName}}</td></tr>\n<tr><td>Callsign:</td><td>{{payload.aisCallsign}}</td></tr>\n<tr><td>Latitude:</td><td>{{payload.aisLatitude}}</td></tr>\n<tr><td>Longitude:</td><td>{{payload.aisLongitude}}</td></tr>\n<tr><td>Speed over ground:</td><td>{{payload.aisSpeedOverGround}}</td></tr>\n<tr><td>Course over ground:</td><td>{{payload.aisCourseOverGround}}</td></tr>\n<tr><td>Turning direction:</td><td>{{payload.aisTurningDirection}}</td></tr>\n<tr><td>Turning rate:</td><td>{{payload.aisTurningRate}}</td></tr>\n</table>\n<br><br>\n",
        "output": "str",
        "x": 530,
        "y": 280,
        "wires": [
            [
                "b390488e.581d"
            ]
        ]
    },
    {
        "id": "d13c6e34.0b70e",
        "type": "comment",
        "z": "f6755db8.da6748",
        "name": "Online AIS decoder",
        "info": "Go to http://your.own.ip.address:1880/aisdecode then enter an AIS message and click Decode.",
        "x": 110,
        "y": 80,
        "wires": []
    },
    {
        "id": "a6ae6b68.96b3",
        "type": "template",
        "z": "f6755db8.da6748",
        "name": "Error table",
        "field": "payload",
        "fieldType": "msg",
        "format": "handlebars",
        "syntax": "mustache",
        "template": "<table style=\\\"width:30%; border: 1px solid red;\\\">\n<tr><td style=\"border: 1px solid red;\">Original AIS message:</td><td style=\"font-family:courier; border: 1px solid red;\">{{payload.aisOriginal}}</td></tr>\n<tr><td style=\"border: 1px solid red;\">Decode error:</td><td style=\"border: 1px solid red;\">{{payload.errorInfo}}</td></tr>\n</table>\n<br><br>\n",
        "output": "str",
        "x": 530,
        "y": 360,
        "wires": [
            [
                "b390488e.581d"
            ]
        ]
    },
    {
        "id": "1ad9cc4e.a321dc",
        "type": "http in",
        "z": "f6755db8.da6748",
        "name": "",
        "url": "/aisdecode",
        "method": "get",
        "upload": false,
        "swaggerDoc": "",
        "x": 120,
        "y": 140,
        "wires": [
            [
                "bb9b126d.0c53e"
            ]
        ]
    },
    {
        "id": "690d0dbe.6270f4",
        "type": "split",
        "z": "f6755db8.da6748",
        "name": "",
        "splt": "\\n",
        "spltType": "str",
        "arraySplt": 1,
        "arraySpltType": "len",
        "stream": false,
        "addname": "",
        "x": 470,
        "y": 140,
        "wires": [
            [
                "44787b67.025ed4"
            ]
        ]
    },
    {
        "id": "a78766c5.f4b24",
        "type": "switch",
        "z": "f6755db8.da6748",
        "name": "",
        "property": "payload.resultCode",
        "propertyType": "msg",
        "rules": [
            {
                "t": "eq",
                "v": "0",
                "vt": "num"
            },
            {
                "t": "eq",
                "v": "1",
                "vt": "num"
            },
            {
                "t": "eq",
                "v": "2",
                "vt": "num"
            },
            {
                "t": "else"
            }
        ],
        "checkall": "true",
        "repair": false,
        "outputs": 4,
        "x": 270,
        "y": 320,
        "wires": [
            [
                "969b4057.05a828"
            ],
            [
                "d0d50d99.26195"
            ],
            [
                "d0d50d99.26195"
            ],
            [
                "a6ae6b68.96b3"
            ]
        ]
    },
    {
        "id": "b390488e.581d",
        "type": "join",
        "z": "f6755db8.da6748",
        "name": "",
        "mode": "auto",
        "build": "string",
        "property": "payload",
        "propertyType": "msg",
        "key": "topic",
        "joiner": "\\n",
        "joinerType": "str",
        "accumulate": "false",
        "timeout": "",
        "count": "",
        "reduceRight": false,
        "x": 730,
        "y": 320,
        "wires": [
            [
                "1c255446.6d553c"
            ]
        ]
    },
    {
        "id": "d0d50d99.26195",
        "type": "change",
        "z": "f6755db8.da6748",
        "name": "",
        "rules": [
            {
                "t": "set",
                "p": "payload",
                "pt": "msg",
                "to": "",
                "tot": "str"
            }
        ],
        "action": "",
        "property": "",
        "from": "",
        "to": "",
        "reg": false,
        "x": 540,
        "y": 320,
        "wires": [
            [
                "b390488e.581d"
            ]
        ]
    },
    {
        "id": "1c255446.6d553c",
        "type": "template",
        "z": "f6755db8.da6748",
        "name": "Main page",
        "field": "payload",
        "fieldType": "msg",
        "format": "handlebars",
        "syntax": "mustache",
        "template": "<!DOCTYPE html>\n<html>\n<head>\n<style>\ntable, th, td {\n  border: 1px solid black;\n  border-collapse: collapse;\n  padding: 15px;\n  text-align: left;\n}\n</style>\n</head>\n\n<body>\n<h1>Simple online AIS decoder</h1>\n<p>Enter one or more AIS messages, then click \"Decode\".<br>\nExample message: !AIVDM,1,1,,B,33P7k`@Oi?wVpv0PB7@=`bw`00pA,0*7B</p>\n\n<form action=\"/aisdecode\">\n<textarea name=\"message\" rows=\"10\" cols=\"100\"></textarea><br>\n<input type=\"submit\" value=\"Decode\">\n</form>\n<br><br>\n{{{payload}}}\n\n</body>\n</html>\n",
        "output": "str",
        "x": 870,
        "y": 320,
        "wires": [
            [
                "24738581.8f23f2"
            ]
        ]
    }
]
```

## References

1. (Wikipedia article on AIS)[https://en.wikipedia.org/wiki/Automatic_identification_system]
2. Software to receive AIS messages through an RTL-SDR radio dongle)[https://github.com/dgiardini/rtl-ais]
3. (AIVDM/AIVDO protocol decoding)[https://gpsd.gitlab.io/gpsd/AIVDM.html] by Eric S. Raymond - full description of AIS message format
4. (GitHub - the node's github repository)[https://github.com/chrisadie/node-red-contrib-ais-decoder]


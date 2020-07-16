# node-red-contrib-ais-decoder
A Node-Red node to decode AIS message strings

## Introduction
The automatic identification system (AIS) is an automatic tracking system that uses transponders on ships. AIS is intended, primarily, to allow ships to view marine traffic in their area and to be seen by that traffic. Further information is available in [Wikipedia](https://en.wikipedia.org/wiki/Automatic_identification_system).

This node accepts AIS messages as input, decodes them, and presents the decoded data at the output. It is mainly intended for use with the [rtl-ais](https://github.com/dgiardini/rtl-ais) software, though it can easily be used in other contexts - e.g. as an online AIS decoder like [this one](http://ais.tbsalling.dk).

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-ais-decoder
```
You will find a new node **ais decoder** in the function pallette.

## Usage

### Input
The input is a stream of AIS messages. There can be multiple AIS messages within a single node-red message payload, as long as they are separated by CR characters.

If you are using the [rtl-ais](https://github.com/dgiardini/rtl-ais) software, you should connect the input of this ais decoder node to a **udp in** node, configured to listen on port 10110 (the default for rtl-ais).

Any invalid AIS messages are silently ignored.

### Output
Output messages contain an object called **ais** which contains the decoded information. The object structure is outlined below.

| Object reference | Data Type | Valid message types  | Meaning |
| ------------- | ------------- |
| `msg.ais` | Object | All | Root object |
| `msg.ais.type` | Integer | All | AIS message type. See Table 4 in [Raymond](https://gpsd.gitlab.io/gpsd/AIVDM.html) |
| `msg.ais.repeatIndicator` | Integer | All | If non-zero, message has been relayed |
| `msg.ais.mmsi` | String(9) | All | Mobile Marine Service Identifier - unique ID of a vessel |
| `msg.ais.turning` | Object | 1 2 3 | If present, contains turning information |
| `msg.ais.turning.direction` | Integer | 1 2 3 | 1=turning right; -1=turning left; 0=not turning |
| `msg.ais.turning.rate` | Integer | 1 2 3 | If present, rate of turn in degrees per minute |

## Example Flows



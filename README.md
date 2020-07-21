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

Any invalid or unknown AIS messages are logged to the console; no other output is generated.

This version only decodes the following AIS message types: 1, 2, 3, 5, 9, 18, 19. Future versions may do more.

### Output
The payload of an output message is an object containing the decoded information. See the file Output.pdf for more information.

## Example Flows



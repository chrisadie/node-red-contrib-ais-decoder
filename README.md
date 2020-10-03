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
You will find a new node **`ais`** in the 'parser' pallette of the node-red editor.

## Usage

### Input
The input is a stream of AIS messages. There must be no more than one AIS message per node-red message.

Some AIS messages have multiple parts. Each part should be in its own node-red message, and the parts should be presented in sequence. The AIS decoder will accumulate the parts until all parts have been received before outputting the decoded information.

### Output
The output message contains the decoded data or error information. See the node description in the Node-Red editor and the  [Github wiki](https://github.com/chrisadie/node-red-contrib-ais-decoder/wiki) for more information.

## Example Flows
To load an example flow, go to the node-red menu at the top right of the screen and select Import. Click on Examples, then choose the relevant example from the node-red-contrib-ais-decoder folder.

### Live AIS data recorder

#### rtl-ais-flow.json
This flow listens on port 10110 for UDP packets from the rtl-ais software. It decodes the packets and stores the decoded information in JSON format in a local file.

If an erroneous packet is detected, a message is logged in the node-red debugger.

### Sample file decoding

#### sample-file-flow.json
This flow reads AIS messages from a file and displays selected decoded messages in the debug window.

### AIS online decoder
#### web-decoder-flow.json
This flow reads one or more AIS messages from a web input form and displays the output in your browser. Go to http://your.own.ip.address:1880/aisdecode then enter an AIS message and click Decode.

## References

1. [Wikipedia article on AIS](https://en.wikipedia.org/wiki/Automatic_identification_system)
2. [Software to receive AIS messages through an RTL-SDR radio dongle](https://github.com/dgiardini/rtl-ais)
3. [AIVDM/AIVDO protocol decoding](https://gpsd.gitlab.io/gpsd/AIVDM.html) by Eric S. Raymond - full description of AIS message format
4. [GitHub - the node's github repository](https://github.com/chrisadie/node-red-contrib-ais-decoder)


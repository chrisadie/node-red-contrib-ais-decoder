// ais-decoder.js
//
// Author: Chris Adie
//
// License: see LICENSE file

//
// Register a creator function for ais-decoder
//
module.exports = function(RED) {
    function AisDecoder(config) {
        RED.nodes.createNode(this,config);
        var node = this;
        var nodeContext = node.context();
        nodeContext.set("tDataPacketQueue",[]);
        node.on('input', function(msg) {
        		var m = processDatagram(node,msg);
        		if (m!=null) {
        			node.send(m);
        		}
        });
    }
    RED.nodes.registerType("ais-decoder",AisDecoder);
}

//
// Divide datagram into AIVDM data packets, queue them and process the queue
//
function processDatagram (node,msg) {
	var f = msg.payload.split('\r');
	for (i=0;i<f.length;i++) {
		queuePacket(node,f[i]);
	}
	return processPacketQueue(node,msg);
}

//
// Add a data packet to the end of the queue
//
function queuePacket(node,dataPacket) {	
	var p = {};
	p.timeStamp = new Date();
	p.dataPacket = dataPacket;
   var q = node.context().get("tDataPacketQueue");
   q.push(p);
   node.context().set("tDataPacketQueue",q);
}

//
// Process the packet queue, returning msg, or null if there
// is not enough unexpired data in the queue.
//
function processPacketQueue(node,msg) {
	var aisPayload = null;
   var q = node.context().get("tDataPacketQueue");
   //timeoutPackets(q);
   console.log("length of Q = "+q.length);
	// Remove old/invalid data packets from the head of the queue
	while (q.length>0 && isInvalid(q[0])) {
		console.log("removed invalid packet");
		q.shift();
	}
	if (q.length>0) {
		// Construct a data payload from one or more data packets
		aisPayload = parsePackets(q);
	}
   node.context().set("tDataPacketQueue",q);
	if (aisPayload==null || msg==null) {
		return null;
	} else {
		msg.aisPayload = aisPayload;
		return msg;
	}
}

//
// If the timestamp on the timed data packet is older than
// the configured lifetime, invalidate the packet.
//
// ToDo: Make lifetime configurable.
//
function timeoutPackets(q) {
	var d = new Date();
	var lifetime = 15000; // Milliseconds
	for (i=0;i<q.length;i++) {
		if (q[i].timeStamp.getTime()+lifetime>d.getTime()) {
			invalidatePacket(q[i]);
		}
	}
}

//
// Return false if the packet is empty, otherwise true.
//
function isInvalid(p) {
	if (p.dataPacket.length == 0) {
		return true;
	}
	else {
		return false;
	}
}

//
// Using the data packet at the head of the queue, collect any other
// related data packets and concatenate the encoded payloads. Return
// the information parsed out of that payload, or null if error.
//
function parsePackets(q) {
	var aisPayload = {};
	var f1 = parseFragment(q[0].dataPacket);
	aisPayload.dataPayload = f1.fData;
	if (f1.fNumber!=1) {
		// Not the first fragment, so assume the first fragment is missing.
		invalidatePacket(q[0]);
		return null;
	}
	if (f1.fCount==1) {
		// Single-fragment message
		invalidatePacket(q[0]);
		return aisPayload;
	}
	// Multi-fragment message. Find the other fragments, assumed to be in order.
	var consumed = [];
	var completed = false;
	var seekingFragmentNumber = 2;
	for (i=1;i<q.length;i++) {
		var fN = parseFragment(q[i].dataPacket);
		if(fN.fCount==f1.fCount
			&& fN.fMessageId==f1.fMessageId
			&& fN.fRadioChannel==f1.fRadioChannel
			&& fN.fNumber==seekingFragmentNumber) {
		 	// This fragment is for us
			aisPayload.dataPayload += fN.fData;
			consumed.push(q[i]);
			if (fN.fNumber==fN.fCount) {
				// It is the last fragment
				completed = true;
				break;
			}
			// Go round and look for next fragment
			seekingFragmentNumber++;
		}
	}
	if (completed) {
		// All fragments found
		invalidatePacket(q[0]);
		consumed.forEach(invalidatePacket);
		return aisPayload;
	} else {
		// Not all fragments available yet
		// ToDo: prevent message with missing fragments from blocking other messages
		return null;
	}
}

//
// Invalidate a queued packet by zeroing the timestamp.
//
function invalidatePacket(p) {
	p.dataPacket = "";
}

//
// Parse an AIVDM fragment and return the decoded information
//
function parseFragment(frag) {
	var result = {};
	var f = frag.split(',');
	result.fCount = parseInt(f[1], 10);
	result.fNumber = parseInt(f[2], 10);
	result.fMessageId = parseInt(f[3], 10);
	result.fRadioChannel = f[4];
	result.fData = f[5];
	result.fChecksum = f[6];
	console.log("parseFragment: "+f[5]);
	return result;
}

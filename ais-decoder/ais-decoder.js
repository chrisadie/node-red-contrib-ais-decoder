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
        nodeContext.set("fragmentList",[]);
        node.on('input', function(msg) {
        		processDatagram(node,msg);
        });
    }
    RED.nodes.registerType("ais-decoder",AisDecoder);
}

//
// Divide datagram into AIVDM data fragments, process them, and
// send resulting message[s] to the next node.
//
function processDatagram (node,msg) {
	var m = [];
	var f = msg.payload.split('\r');
	for (i=0;i<f.length;i++) {
		var frag = parseFragment(f[i]);
		if (frag!=null) {
			// Put the message into an array, in case we have to send more than one message
			if (m.length==0) {
				m[0] = msg;
			} else {
				m.push({});
			}
			m[m.length-1].payload = f[i];
			if (frag.fCount==1) {
				// Single-fragment AIVDM sentence
				m[m.length-1].aisData = decodeAisData(frag.fData);
			} else {
				// Multi-fragment AIVDM sentence
				var mf = processMultiFragments(node,frag);
				if (mf!=null) {
					// We have a complete AIVDM sentence to return
					m[m.length-1].aisData = decodeMultiFrag(mf);
				} else {
					// AIVDM sentence still incomplete - we can't return it
					m.pop();
				}
			}
		}
	}
	if (m.length>0) {
		var mm = [m];
		node.send(mm);
	}
}

//
// Add a fragment to the list of fragments, returning a list of fragments
// if all fragments have been recieved.
//
function processMultiFragments(node,frag) {	
	var list = node.context().get("fragmentList");
	addFragmentToList(list,frag);
	var f = extractComplete(list);
	removeUnwanted(list);
	return f;
}

//
// Add a fragment to the list of arrays of fragments
//
function addFragmentToList(list,frag) {
	var item;
	for (i=0;i<list.length;i++) {
		item = list[i];
		if (item.length>0
			&& !item[0].unwanted
			&& !item[0].complete
			&& item[0].fCount==frag.fCount
			&& item[0].fMessageId==frag.fMessageId
			&& item[0].fRadioChannel==frag.fRadioChannel) {
			if (item.length+1==frag.fNumber) {
				// We have the next fragment!
				item.push(frag);
				if (frag.fNumber==frag.fCount) {
					// It is the last fragment!
					item[0].complete = true;
				}
			} else {
				// Out-of-sequence fragment
				// Mark sequence unwanted
				item[0].unwanted = true;
			}
			break;
		}
  	}
	if (frag.fNumber==1) {
		// First fragment of a new sentence
		frag.timeStamp = new Date();
		item = [frag];
		list.push(item);
   }
}

//
// Extract and return a complete fragment sequences from the list
//
function extractComplete(list) {
	var seq;
	var i = 0;
	while (i<list.length) {
		seq = list[i];
		if (seq[0].complete) {
			// Remove the sequence
			list.splice(i,1);
			return seq;
		} else {
			// Next sequence
			i++;
		}
	}
	return null;
}

//
// Remove unwanted fragment sequences from the list
//
function removeUnwanted(list) {
	var seq;
	var i = 0;
	var d = new Date();
	while (i<list.length) {
		seq = list[i];
		if (seq[0].timeStamp.getTime()+15000<d.getTime()) {
			seq[0].unwanted = true;
		}
		if (seq[0].unwanted) {
			// Remove the sequence
			list.splice(i,1);
		} else {
			// Next sequence
			i++;
		}
	}
}

//
// Parse and validate an AIVDM fragment and return the decoded information,
// or null if there's a parse error.
//
function parseFragment(frag) {
	var result = {};
	var f = frag.split(',');
	if (f.length!=7) {
		return null;
	}
	if (f[0]!="!AIVDM") {
		return null;
	}
	result.fHead = f[0];
	result.fCount = parseInt(f[1], 10);
	result.fNumber = parseInt(f[2], 10);
	if (result.fCount==NaN || result.fNumber==NaN) {
		return null;
	}
	result.fMessageId = parseInt(f[3], 10);
	result.fRadioChannel = f[4];
	result.fData = f[5];
	result.fChecksum = f[6];
	// ToDo: validate checksum
	return result;
}

//
// Take an array of sentence fragments, concatenate the data, and return
// the decoded information.
//
function decodeMultiFrag(fArray) {
	var data = ""
	for (i=0;i<fArray.length;i++) {
		data += fArray[i].fData;
	}
	return decodeAisData(data);
}

//
// Decode an AIS data string
//
function decodeAisData(data) {
	// @@@
	return data;
}

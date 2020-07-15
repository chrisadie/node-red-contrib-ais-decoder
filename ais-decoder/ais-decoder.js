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
	var i,frag,frags,mf;
	var m = [];
	var f = msg.payload.split('\r');
	for (i=0;i<f.length;i++) {
		frag = parseFragment(f[i]);
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
				frags = [frag];
				m[m.length-1].aisData = decodeAisSentence(frags);
			} else {
				// Multi-fragment AIVDM sentence
				mf = processMultiFragments(node,frag);
				if (mf!=null) {
					// We have a complete AIVDM sentence to return
					m[m.length-1].aisData = decodeAisSentence(mf);
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
	var i;
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
	if (f[6].length!=4) {
		return null;
	}
	result.fFillBits = parseInt(f[6]);
	if (result.fFillBits==NaN || result.fFillBits<0 || result.fFillBits>5) {
		return null;
	}
	if (f[6].slice(1,2)!="*") {
		return null;
	}
	var cksm = parseInt(f[6].slice(2,4),16);
	if (cksm != computeChecksum(frag)) {
		return null;
	}
	return result;
}

//
// Compute checksum
//
function computeChecksum(fragment) {
	var buf = Buffer.from(fragment);
	var csum = 0;
	var i;
	for (i=1;i<fragment.length-3;i++) {
		csum = csum ^ buf[i];
	}
	return csum;
}

//
// Decode an AIS sentence. Input is a list of parsed fragments,
// return value is an object carrying the information extracted from
// the fragment payloads.
//
function decodeAisSentence(frags) {
	var data = [];
	var aisData = {};
	var i,b,mmsi;
	// Concatenate the data from the fragments
	for (i=0;i<frags.length;i++) {
		data += frags[i].fData;
	}
	// Create a numeric array binPayload containing the raw
	// binary 6-bit "nobbles", one nobble to each array member.
	var rawPayload = Buffer.from(data);
	var binPayload = [];
	for (i=0;i<rawPayload.length;i++) {
		b = rawPayload[i]-48;
		if (b>40) b -= 8;
		if (b<0 || b>63) {
			return null;
		}
		binPayload[i] = b;
	}
	// Now start extracting data from binPayload
	aisData.aisType = extractInt(binPayload,0,6);
	aisData.aisRepeatIndicator = extractInt(binPayload,6,2);
	mmsi = extractInt(binPayload,8,30);
	aisData.aisMmsi = padLeft(mmsi.toString(),"0",9);
    switch (aisData.aisType) {
        case 1:
        case 2:
        case 3:
            extractPositionReportA(aisData,binPayload);
            break;
        default:
            break;
    }
	// @@@
	return aisData;
}

const sixBit = "@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !\"#$%&\'()*+,-./0123456789:;<=>?";

//
// Convert nobble data to character string
//
function nobbleString(binNobbles,start,end) {
	var i,data="";
	for (i=start;i<end;i++) {
		data = data + sixBit.slice(binNobbles[i],binNobbles[i]+1);
	}
	return data;
}

//
// Pad str on left to len with pad
//
function padLeft(str,pad,len) {
	if (pad.length>0) {
		while (str.length<len) {
			str = pad + str;
		}
	}
	return str;
}

//
// Extract an integer from nobble array. Second parameter is the bit
// count to start from, nBits is the number of bits to extract.
//
function extractInt(nobbles,start,nBits) {
	var result = 0;
	var offset, theBit, bitOffset, i, nobble;
	// Proceed bit by bit
	for(i=0;i<nBits;i++) {
		// Compute offset into nobbles; retrieve nobble
		offset = Math.floor((start+i)/6);
		nobble = nobbles[offset];
		// Extract the bit we want
		bitOffset = 5 - ((start+i)%6);
		theBit = (nobble >> bitOffset) & 1;
		// Push theBit onto the least-significant end of the result
		result = result << 1;
		result |= theBit;
	}
	return result;
}

//
// Decode position report type A
//
function extractPositionReportA(aisData,binPayload) {
    aisData.aisNavigationStatus = extractInt(binPayload,38,4);
    var rot = extractInt(binPayload,42,8);
    if (rot!=128) {
        // Rate of turn information is available
        aisData.aisRateOfTurn = decodeRateOfTurn(rot);
    }
}

//
// Rate of turn decodong
//
function decodeRateOfTurn(rot) {
    var RateOfTurn = {};
    rot &= 0xFF;
    switch (rot) {
        case 0:
            RateOfTurn.direction = 0;   // Not turning
            break;
        case 0x80:
            return null;                // No turning information available
        case 0x7F:
            RateOfTurn.direction = 1;   // Turning right
            break
        case 0x81:
            RateOfTurn.direction = -1;  // Turning left
            break;
        default:
            if ((rot & 0x80) == 0x80) {
                rot = rot - 256;
                RateOfTurn.direction = -1;
            } else {
                RateOfTurn.direction = 1;
            }
            RateOfTurn.rate = Math.pow(rot/4.733,2).toFixed();
            break;
    }
    return RateOfTurn;
}

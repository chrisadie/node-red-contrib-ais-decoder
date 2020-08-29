/**
 * Copyright 2020 Chris Adie
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * It is a condition of use of this software that it shall not be used in
 * a safety-critical application, such as for marine navigation.
 *
 **/

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
        	processMessage(node,msg);
        });
    }
    RED.nodes.registerType("ais-decoder",AisDecoder);
};

//
// Main function to receive and forward node-red messages
//
function processMessage(node,msg) {
    var result = {};
    var f;
    f = msg.payload.trim();
    if (f) {
        result = processFragment(node,f);
        if (result===null) {
            // Partial message
            msg.payload = undefined;
            msg.resultCode = 2;
        } else {
            if (result.errorInfo) {
                // Erroneous message
                msg.payload = undefined;
                msg.errorInfo = result.errorInfo;
                msg.originalAisMessage = result.aisOriginal;
                msg.resultCode = 3;
            } else {
                // Message decoded successfully
                msg.payload = result;
                msg.originalAisMessage = result.aisOriginal;
                result.aisOriginal = undefined;
                msg.payload.talkerId = msg.originalAisMessage[0].slice(1,3);
                msg.resultCode = 0;
                addTextFields(msg);
            }
        }
    } else {
        // Empty message
        msg.payload = undefined;
        msg.resultCode = 1;
    }
    node.send(msg);
}

//
// Take a fragment, deal with multi-fragment sentences,
// decode and return the decoded information.
//
function processFragment(node,f) {
    var err = {};
    var frags,i,orig;
    var result = {};
    var frag = parseFragment(f,err);
    if (frag===null) {
        // Parse error
        result = {"aisOriginal": f, "errorInfo": err.reason};
        return result;
    }
    if (frag.fCount==1) {
        // Single-fragment AIVDM sentence
        frags = [frag];
    } else {
        // Multi-fragment AIVDM sentence
        frags = processMultiFragments(node,frag);
        if (frags===null) {
            // Sentence still incomplete
            return null;
        }
    }
    // We have a complete AIVDM sentence to decode
    result = decodeAisSentence(frags,err);
    if (result===null) {
        // Decode error
        orig = reconstructFragments(frags);
        result = {"aisOriginal": orig, "errorInfo": err.reason};
        return result;
    }
    result.aisOriginal = reconstructFragments(frags);
    return result;
}

//
// Reconstruct a string array containing the original fragments
//
function reconstructFragments(frags) {
    var result = [];
    var i;
    for (i=0;i<frags.length;i++) {
        result.push(frags[i].fOriginal);
    }
    return result;
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
// or null if there's a parse error (setting err.reason).
//
function parseFragment(frag,err) {
	var result = {};
	var f = frag.split(',');
    err.fragment = frag;
    result.fOriginal = frag;
	if (f.length!=7) {
        err.reason = "Wrong number of fields in fragment";
		return null;
	}
	if (!validateInitialField(f[0])) {
        err.reason = "Not an AIS message: "+f[0];
		return null;
	}
	result.fHead = f[0];
	result.fCount = parseInt(f[1], 10);
	result.fNumber = parseInt(f[2], 10);
	if (isNaN(result.fCount) || isNaN(result.fNumber)) {
        err.reason = "Missing Count and Number fields";
		return null;
	}
	result.fMessageId = parseInt(f[3], 10);
	result.fRadioChannel = f[4];
	result.fData = f[5];
	if (f[6].length!=4) {
        err.reason = "Final field length invalid";
		return null;
	}
	result.fFillBits = parseInt(f[6]);
	if (isNaN(result.fFillBits) || result.fFillBits<0 || result.fFillBits>6) {
        err.reason = "Invalid number of fill bits: "+result.fFillBits;
		return null;
	}
	if (f[6].slice(1,2)!="*") {
        err.reason = "Missing asterisk from final field";
		return null;
	}
	var cksm = parseInt(f[6].slice(2,4),16);
	if (cksm != computeChecksum(frag)) {
        err.reason = "Checksum failure";
		return null;
	}
	return result;
}

//
// Validate the initial field of a fragment.
//
function validateInitialField(f) {
    if (f.length!=6) return false;
    if (f.charAt(0)!="!") return false;
    var s = f.slice(1,3);
    switch (s) {
        case "AB":
        case "AD":
        case "AI":
        case "AN":
        case "AR":
        case "AS":
        case "AT":
        case "AX":
        case "BS":
        case "SA":
            break;
        default:
            return false;
    }
    s = f.slice(3,6);
     switch (s) {
        case "VDM":
        case "VDO":
            break;
        default:
            return false;
    }
    return true;
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
function decodeAisSentence(frags,err) {
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
            err.reason = "Invalid data in payload";
			return null;
		}
		binPayload[i] = b;
	}
    var nBits = 6*rawPayload.length - frags[frags.length-1].fFillBits;
    if (nBits<37) {
        err.reason = "Cannot decode Common Navigation Block: insufficient data in payload. Expected at least 37, only found  " + nBits;
        return null;
    }
	// Now start extracting data from binPayload
	aisData.messageType = extractInt(binPayload,0,6);
	aisData.repeatIndicator = extractInt(binPayload,6,2);
	mmsi = extractInt(binPayload,8,30);
	aisData.senderMmsi = padLeft(mmsi.toString(),"0",9);
    switch (aisData.messageType) {
        case 1:
        case 2:
        case 3:
            err.reason = extractPositionReportA(aisData,binPayload,nBits);
            break;
        case 4:
        case 11:
            err.reason = extractBaseStationReport(aisData,binPayload,nBits);
            break;
        case 5:
            err.reason = extractStaticReport(aisData,binPayload,nBits);
            break;
        case 6:
            err.reason = extractBinaryAddressedMessage(aisData,binPayload,nBits);
            break;
        case 8:
            err.reason = extractBinaryBroadcastMessage(aisData,binPayload,nBits);
            break;
        case 9:
            err.reason = extractSarReport(aisData,binPayload,nBits);
            break;
        case 10:
            err.reason = extractUtcEnquiry(aisData,binPayload,nBits);
            break;
        case 16:
            err.reason = extractAssignmentModeCommand(aisData,binPayload,nBits);
            break;
        case 17:
            err.reason = extractDgnssBroadcastBinaryMessage(aisData,binPayload,nBits);
            break;
        case 18:
        case 19:
            err.reason = extractPositionReportB(aisData,binPayload,nBits);
            break;
        case 20:
            err.reason = extractDataLinkManagement(aisData,binPayload,nBits);
            break;
        case 21:
            err.reason = extractAidToNavigationReport(aisData,binPayload,nBits);
            break;
        case 22:
            err.reason = extractChannelManagement(aisData,binPayload,nBits);
            break;
        case 24:
            err.reason = extractStaticReport24(aisData,binPayload,nBits);
            break;
        case 25:
            err.reason = extractSingleSlotBinaryMessage(aisData,binPayload,nBits);
            break;
        default:
            err.reason = "Unsupported AIS message type " + aisData.messageType;
            break;
    }
	// Did we encounter an error?
    if (err.reason) {
        return null;
    }
	return aisData;
}

//
// Pad str on left to len with pad
//
function padLeft(str,pad,len) {
	if (pad) {
		while (str.length<len) {
			str = pad + str;
		}
	}
	return str;
}

//
// Extract an integer from nobble array. Second parameter is the bit
// count to start from, nBits is the number of bits to extract, signed
// is true if a signed integer is required.
//
function extractInt(nobbles,start,nBits,signed=false) {
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
        // To deal correctly with negative numbers, propogate the first bit up the result
        if (signed && theBit && i==0) {
            result = -1;
        }
		// Push theBit onto the least-significant end of the result
		result = result << 1;
		result |= theBit;
	}
	return result;
}
                            
//
// Extract a string from nobble array. Second parameter is the bit
// count to start from, nBits is the number of bits to extract to form
// the string.
//

const sixBit = "@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_ !\"#$%&\'()*+,-./0123456789:;<=>?";

function extractString(binPayload,start,nBits) {
    var str = "", strchr;
    var offset, theBit, bitOffset, i, nobble, chr;
    // Proceed bit by bit
    for (i=0;i<nBits;i++) {
        // Compute offset into nobbles; retrieve nobble
        offset = Math.floor((start+i)/6);
        nobble = binPayload[offset];
        // Extract the bit we want
        bitOffset = 5 - ((start+i)%6);
        theBit = (nobble >> bitOffset) & 1;
        strchr = strchr << 1;
        strchr |= theBit;
        if (i%6==5) {
            // End of this char
            str += sixBit[strchr];
            strchr = 0;
        }
    }
    return str;
}

//
// Extract binary data, returning a string of bits
//
function extractBinary(binPayload,start,nBits) {
    var str = "";
    var offset, theBit, bitOffset, i, nobble;
    // Proceed bit by bit
    for (i=0;i<nBits;i++) {
        // Compute offset into nobbles; retrieve nobble
        offset = Math.floor((start+i)/6);
        nobble = binPayload[offset];
        // Extract the bit we want
        bitOffset = 5 - ((start+i)%6);
        theBit = (nobble >> bitOffset) & 1;
        str += theBit ? "1" : "0";
    }
    return str;
}

//
// Extract lat and long from payload
//
function extractLatLong(aisData,binPayload,start) {
    var long = extractInt(binPayload,start,28,true);
    if (long!=0x6791AC0) {
        // Longitude information available
        aisData.longitude = long/600000.0;
    }
    var lat = extractInt(binPayload,start+28,27,true);
    if (lat!=0x3412140) {
        // Latitude information available
        aisData.latitude = lat/600000.0;
    }
}
                            
//
// Decode position report type A (message types 1 2 3). Update the ais data object, and return
// empty string, or error string.
//
function extractPositionReportA(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,149);
    if (lenerr) {
        return lenerr;
    }
    aisData.navigationStatus = extractInt(binPayload,38,4);
    var rot = extractInt(binPayload,42,8);
    if (rot!=128) {
        // Rate of turn information is available
        decodeRateOfTurn(aisData,rot);
    }
    var speed = extractInt(binPayload,50,10);
    if (speed!=1023) {
        // Speed information is available
        aisData.speedOverGround = speed/10.0;
    }
    aisData.positionAccuracy = extractInt(binPayload,60,1);
    extractLatLong(aisData,binPayload,61);
    var cog = extractInt(binPayload,116,12);
    if (cog!=3600) {
        // Course over ground available
        aisData.courseOverGround = cog/10.0;
    }
    var tHead = extractInt(binPayload,128,9);
    if (tHead!=511) {
        // True heading available
        aisData.trueHeading = tHead;
    }
    var tStamp = extractInt(binPayload,137,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.timeStampSeconds = tStamp;
    } else
    if (tStamp>60 && tStamp<=63) {
        // Positioning system info available
        aisData.positioningSystemStatus = tStamp-60;
    }
    var man = extractInt(binPayload,143,2);
    if (man!=0) {
        // Manoeuvre data available
        aisData.manoeuvre = man;
    }
    aisData.raim = Boolean(extractInt(binPayload,148,1));
    return "";
}

//
// Decode position report type B (message types 18 19).
//
function extractPositionReportB(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,148);
    if (lenerr) {
        return lenerr;
    }
    var speed = extractInt(binPayload,46,10);
    if (speed!=1023) {
        // Speed information is available
        aisData.speedOverGround = speed/10.0;
    }
    aisData.positionAccuracy = extractInt(binPayload,56,1);
    extractLatLong(aisData,binPayload,57);
    var cog = extractInt(binPayload,112,12);
    if (cog!=3600) {
        // Course over ground available
        aisData.courseOverGround = cog/10.0;
    }
    var tHead = extractInt(binPayload,124,9);
    if (tHead!=511) {
        // True heading available
        aisData.trueHeading = tHead;
    }
    var tStamp = extractInt(binPayload,133,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.timeStampSeconds = tStamp;
    } else
    if (tStamp>60 && tStamp<=63) {
        // Positioning system info available
        aisData.positioningSystemStatus = tStamp-60;
    }
    if (aisData.messageType==19) {
        // Extended message
        lenerr = checkPayloadLength(aisData,nBits,306);
        if (lenerr) {
            return lenerr;
        }
        aisData.name = extractString(binPayload,143,120).trim();
        aisData.name = normaliseString(aisData.name);
        aisData.shipType = extractInt(binPayload,263,8);
        aisData.dimensionToBow = extractInt(binPayload,271,9);
        aisData.dimensionToStern = extractInt(binPayload,280,9);
        aisData.dimensionToPort = extractInt(binPayload,289,6);
        aisData.dimensionToStarboard = extractInt(binPayload,295,6);
        aisData.fixType = extractInt(binPayload,301,4);
        aisData.raim = Boolean(extractInt(binPayload,305,1));
    } else {
        aisData.raim = Boolean(extractInt(binPayload,147,1));
    }
    return "";
}
                            
//
// Rate of turn decodong
//
function decodeRateOfTurn(aisData,rot) {
    rot &= 0xFF;
    switch (rot) {
        case 0:
            aisData.turningDirection = 0;   // Not turning
            break;
        case 0x80:
            break;                   // No turning information available
        case 0x7F:
            aisData.turningDirection = 1;   // Turning right
            break
        case 0x81:
            aisData.turningDirection = -1;  // Turning left
            break;
        default:
            if ((rot & 0x80) == 0x80) {
                rot = rot - 256;
                aisData.turningDirection = -1;
            } else {
                aisData.turningDirection = 1;
            }
            aisData.turningRate = Math.pow(rot/4.733,2).toFixed();
            break;
    }
}

//
// Decode static and voyage-related data (message type 5).
//
function extractStaticReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,420);
    if (lenerr) {
        return lenerr;
    }
    aisData.version = extractInt(binPayload,38,2);
    aisData.shipId = extractInt(binPayload,40,30);
    aisData.callsign = extractString(binPayload,70,42).trim();
    aisData.callsign = normaliseString(aisData.callsign);
    aisData.name = extractString(binPayload,112,120).trim();
    aisData.name = normaliseString(aisData.name);
    aisData.shipType = extractInt(binPayload,232,8);
    aisData.dimensionToBow = extractInt(binPayload,240,9);
    aisData.dimensionToStern = extractInt(binPayload,249,9);
    aisData.dimensionToPort = extractInt(binPayload,249,6);
    aisData.dimensionToStarboard = extractInt(binPayload,264,6);
    aisData.fixType = extractInt(binPayload,270,4);
    // Create a Date with the ETA
    var mo = extractInt(binPayload,274,4);
    var da = extractInt(binPayload,278,5);
    var ho = extractInt(binPayload,283,5);
    var mi = extractInt(binPayload,288,6);
    aisData.eta = new Date();
    var tm = aisData.eta.getMonth()+1;
    if (tm>=11 && mo<=2) {
        // ETA is probably next year
        var ty = aisData.eta.getFullYear();
        ty++;
        aisData.eta.setFullYear(ty);
    }
    aisData.eta.setMonth(mo-1);
    aisData.eta.setDate(da);
    aisData.eta.setHours(ho);
    aisData.eta.setMinutes(mi);
    aisData.eta.setSeconds(0);
    aisData.draught = extractInt(binPayload,294,8)/10.0;
    var d = nBits-302;
    if (d>120) {
        d = 120;
    }
    aisData.destination = extractString(binPayload,302,d).trim();
    aisData.destination = normaliseString(aisData.destination);
    return "";
}

//
// Replace one or more @ with spaces, then trim trailing space
//
function normaliseString(str) {
    var noAt = str.replace(/@/g," ");
    return noAt.trim();
}

//
// Decode SAR aircraft position report (message type 9).
//
function extractSarReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,147);
    if (lenerr) {
        return lenerr;
    }
    var alt = extractInt(binPayload,38,12);
    if (alt!=4095) {
        aisData.altitude = alt;
    }
    var speed = extractInt(binPayload,50,10);
    if (speed!=1023) {
        // Speed information is available
        aisData.speedOverGround = speed*1.0;
    }
    aisData.positionAccuracy = extractInt(binPayload,60,1);
    extractLatLong(aisData,binPayload,61);
    var cog = extractInt(binPayload,116,12);
    if (cog!=3600) {
        // Course over ground available
        aisData.courseOverGround = cog/10.0;
    }
    var tStamp = extractInt(binPayload,128,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.timeStampSeconds = tStamp;
    } else
    if (tStamp>60 && tStamp<=63) {
        // Positioning system info available
        aisData.positioningSystemStatus = tStamp-60;
    }
    aisData.raim = Boolean(extractInt(binPayload,148,1));
    return "";
}

//
// Decode base station report (message type 4).
//
function extractBaseStationReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,149);
    if (lenerr) {
        return lenerr;
    }
    var y = extractInt(binPayload,38,14);
    var mo = extractInt(binPayload,52,4);
    var d = extractInt(binPayload,56,5);
    var h = extractInt(binPayload,61,5);
    var mi = extractInt(binPayload,66,6);
    var s = extractInt(binPayload,72,6);
    aisData.baseTime = new Date(y,mo-1,d,h,mi,s,0);
    aisData.positionAccuracy = extractInt(binPayload,78,1);
    extractLatLong(aisData,binPayload,79);
    aisData.fixType = extractInt(binPayload,134,4);
    aisData.raim = Boolean(extractInt(binPayload,148,1));
    return "";
}

//
// Decode binary addressed message (message type 6).
//
function extractBinaryAddressedMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,88);
    if (lenerr) {
        return lenerr;
    }
    aisData.sequenceNumber = extractInt(binPayload,38,2);
    var mmsi = extractInt(binPayload,40,30);
    aisData.destinationMmsi = padLeft(mmsi.toString(),"0",9);
    aisData.retransmitted = Boolean(extractInt(binPayload,70,1));
    aisData.designatedAreaCode = extractInt(binPayload,72,10);
    aisData.functionalId = extractInt(binPayload,82,6);
    var binLength = nBits - 88;
    if (binLength>920) binLength = 920;
    if (binLength>0) {
        aisData.binaryData = extractBinary(binPayload,88,binLength);
        lenerr = interpretBinaryData(aisData,binPayload,88,binLength);  // Experimental
    }
    return lenerr;
}
                                              
//
// Decode binary broadcast message (message type 8).
//
function extractBinaryBroadcastMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,56);
    if (lenerr) {
        return lenerr;
    }
    aisData.designatedAreaCode = extractInt(binPayload,40,10);
    aisData.functionalId = extractInt(binPayload,50,6);
    var binLength = nBits - 56;
    if (binLength>952) binLength = 952;
    if (binLength>0) {
        aisData.binaryData = extractBinary(binPayload,56,binLength);
        lenerr = interpretBinaryData(aisData,binPayload,56,binLength);  // Experimental
    }
    return "";
}

//
// Decode DGNSS broadcast message (message type 17).
//
function extractDgnssBroadcastBinaryMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,80);
    if (lenerr) {
        return lenerr;
    }
    var long = extractInt(binPayload,40,18,true);
    if (long!=0x01a838) {
        // Longitude information available
        aisData.longitude = long/600.0;
    }
    var lat = extractInt(binPayload,58,17,true);
    if (lat!= 0x00d548) {
        // Latitude information available
        aisData.latitude = lat/600.0;
    }
    var binLength = nBits - 80;
    if (binLength>736) binLength = 736;
    if (binLength>0) {
        aisData.binaryData = extractBinary(binPayload,80,binLength);
    }
    return "";
}

//
// Decode Aid-to-navigation message (message type 21).
//
function extractAidToNavigationReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,272);
    if (lenerr) {
        return lenerr;
    }
    aisData.navAid = extractInt(binPayload,38,5);
    var n = extractString(binPayload,43,120);
    if (n) {
        if (n.charAt(n.length-1)=="@") {
            // Need to look at name extension field
            if (nBits>272) {
                n += extractString(binPayload,272,nBits-272);
            }
        }
    }
    aisData.name = normaliseString(n.trim());
    aisData.positionAccuracy = extractInt(binPayload,163,1);
    extractLatLong(aisData,binPayload,164);
    aisData.dimensionToBow = extractInt(binPayload,219,9);
    aisData.dimensionToStern = extractInt(binPayload,228,9);
    aisData.dimensionToPort = extractInt(binPayload,237,6);
    aisData.dimensionToStarboard = extractInt(binPayload,243,6);
    aisData.fixType = extractInt(binPayload,249,4);
    var tStamp = extractInt(binPayload,253,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.timeStampSeconds = tStamp;
    } else
    if (tStamp>60 && tStamp<=63) {
        // Positioning system info available
        aisData.positioningSystemStatus = tStamp-60;
    }
    aisData.offPosition = Boolean(extractInt(binPayload,259,1));
    aisData.raim = Boolean(extractInt(binPayload,268,1));
    aisData.virtualAid = Boolean(extractInt(binPayload,269,1));
    aisData.assignedMode = Boolean(extractInt(binPayload,270,1));
    return "";
}

//
// Decode UTC enquiry message (message type 10).
//
function extractUtcEnquiry(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,72);
    if (lenerr) {
        return lenerr;
    }
    var mmsi = extractInt(binPayload,40,30);
    aisData.destinationMmsi = padLeft(mmsi.toString(),"0",9);
    return "";
}

//
// Decode static report (message type 24).
//
function extractStaticReport24(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,40);
    if (lenerr) {
        return lenerr;
    }
    var part = extractInt(binPayload,38,2);
    switch (part) {
        case 0:
            aisData.messageType24Part = "A";
            lenerr = checkPayloadLength(aisData,nBits,160);
            if (lenerr) {
                return lenerr;
            }
            aisData.name = extractString(binPayload,40,120).trim();
            aisData.name = normaliseString(aisData.name);
            return "";
        case 1:
            aisData.messageType24Part = "B";
            lenerr = checkPayloadLength(aisData,nBits,168);
            if (lenerr) {
                return lenerr;
            }
            aisData.shipType = extractInt(binPayload,40,8);
            aisData.vendorId = extractString(binPayload,48,42).trim();
            aisData.vendorId = normaliseString(aisData.vendorId);
            aisData.unitModelCode = extractInt(binPayload,66,4);
            aisData.unitSerialNumber = extractInt(binPayload,70,20);
            aisData.callsign = extractString(binPayload,90,42).trim();
            aisData.callsign = normaliseString(aisData.callsign);
            aisData.dimensionToBow = extractInt(binPayload,132,9);
            aisData.dimensionToStern = extractInt(binPayload,141,9);
            aisData.dimensionToPort = extractInt(binPayload,150,6);
            aisData.dimensionToStarboard = extractInt(binPayload,156,6);
            var mmsi = extractInt(binPayload,132,30);
            aisData.mothershipMmsi = padLeft(mmsi.toString(),"0",9);
            return "";
        default:
            return "Invalid part indicator in type 24 message";
    }
}

//
// Decode type 20 message.
//
function extractDataLinkManagement(aisData,binPayload,nBits) {
    // ToDo: decode data link management information
    return "";
}

//
// Decode type 22 message.
//
function extractChannelManagement(aisData,binPayload,nBits) {
    // ToDo: decode channel management information
    return "";
}

//
// Decode type 16 message.
//
function extractAssignmentModeCommand(aisData,binPayload,nBits) {
    // ToDo: decode assignment mode command
    return "";
}

//
// Decode type 25 message.
//
function extractSingleSlotBinaryMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,40);
    if (lenerr) {
        return lenerr;
    }
    var addressed = extractInt(binPayload,38,1);
    var structured = extractInt(binPayload,39,1);
    var start = 40;
    if (addressed) {
        lenerr = checkPayloadLength(aisData,nBits,start+30);
        if (lenerr) {
            return lenerr;
        }
        var mmsi = extractInt(binPayload,start,30);
        aisData.destinationMmsi = padLeft(mmsi.toString(),"0",9);
        start += 30;
    }
    if (structured) {
        lenerr = checkPayloadLength(aisData,nBits,start+16);
        if (lenerr) {
            return lenerr;
        }
        aisData.designatedAreaCode = extractInt(binPayload,start,10);
        start += 10;
        aisData.functionalId = extractInt(binPayload,start,6);
        start += 6;
    }
    var binLength = nBits - start;
    if (binLength) {
        aisData.binaryData = extractBinary(binPayload,start,binLength);
        if (structured) {
            lenerr = interpretBinaryData(aisData,binPayload,start,binLength);  // Experimental
        }
    }
    return lenerr;
}

//
// Check for an erroneous payload length
//
function checkPayloadLength(aisData,nBits,minimum) {
    if (nBits<minimum) {
        return "Cannot decode message type "+aisData.messageType+": insufficient data in payload. Expected at least "+minimum+", only found "+nBits;
    }
    return "";
}

//
// Certain messages contain embedded binary data which is interpreted according to the DAC and FID.
// The following code is experimental.
//
                                              
const dispatch = [
    {"mty": 6,  "dac": 0,  "fid":  0,                            "text": "Monitoring aids to navigation"},
    {"mty": 6,  "dac": 1,  "fid":  2,                            "text": "Interrogation for specified FMs within the IAI branch"},
    {"mty": 6,  "dac": 1,  "fid":  3,                            "text": "Capability interrogation"},
    {"mty": 6,  "dac": 1,  "fid":  4,                            "text": "Capability reply"},
    {"mty": 6,  "dac": 1,  "fid": 40,  "func": interpret_6_1_40, "text": "Number of persons on board"},
    {"mty":25,  "dac": 1,  "fid":  0,  "func": interpret_25_1_0, "text": "Text using 6-bit ASCII"},
    // ToDo: extend the decoding capabilities for messages 6 8 and 25. See https://www.iala-aism.org/asm/
];
                                              
function interpretBinaryData(aisData,binPayload,start,binLength) {
    var i;
    for (i=0;i<dispatch.length;i++) {
        if (dispatch[i].mty==aisData.messageType &&
            dispatch[i].dac==aisData.designatedAreaCode &&
            dispatch[i].fid==aisData.functionalId) {
                aisData.messageSubtype_text = dispatch[i].text;
            if (dispatch[i].func===undefined) {
                return "";
            } else {
                return dispatch[i].func(aisData,binPayload,start,binLength);
            }
        }
    }
    return "";
}

function interpret_6_1_40(aisData,binPayload,start,binLength) {
    var lenerr = "";
    if (binLength<16) {
        lenerr = "Cannot fully decode message type 6 (1,40): insufficient data in payload.";
    } else {
        var n = extractInt(binPayload,start,13);
        if (n) aisData.numberOfPersons = n;
    }
    return lenerr;
}

function interpret_25_1_0(aisData,binPayload,start,binLength) {
    var lenerr = "";
    if (binLength<11) {
        lenerr = "Cannot fully decode message type 25 (1,0): insufficient data in payload.";
    } else {
        var n = extractInt(binPayload,start,11);
        if (n) aisData.message25TextSequenceNumber = n;
        if (binlength>=17) {
            var s = extractString(binPayload,start+11,binLength-11).trim();
            aisData.message25Text = normaliseString(s);
        }
    }
    return lenerr;
}

//
// Add *_text fields to the message payload
//
function addTextFields(msg) {
    for (var i=0;i<talkerId_enum.length;i++) {
        if (talkerId_enum[i].id==msg.payload.talkerId) {
            msg.payload.talkerId_text = talkerId_enum[i].desc;
            break;
        }
    }
    msg.payload.messageType_text = textMember(msg,"messageType");
    msg.payload.navigationStatus_text = textMember(msg,"navigationStatus");
    msg.payload.turningDirection_text = textMember(msg,"turningDirection",1);
    msg.payload.positionAccuracy_text = textMember(msg,"positionAccuracy");
    msg.payload.positioningSystemStatus_text = textMember(msg,"positioningSystemStatus");
    msg.payload.manoeuvre_text = textMember(msg,"manoeuvre");
    msg.payload.shipType_text = textMember(msg,"shipType");
    msg.payload.fixType_text = textMember(msg,"fixType");
    msg.payload.navAid_text = textMember(msg,"navAid");
}

//
// Return the textual interpretation of the given payload member
//
function textMember(msg,memberName,offset=0) {
    var result;
    var member = eval("msg.payload."+memberName);
    if (!isNaN(member)) {
        member += offset;
        var lengthEnumArray = eval(memberName+"_enum.length");
        if (member < lengthEnumArray) {
            result = eval(memberName+"_enum[member]");
        } else {
            result = unexpected;
        }
    }
    return result;
}
                                           
const unexpected = "Unexpected value";
const reserved = "Reserved for future use";
                                           
const talkerId_enum = [
    {id: "AI", desc: "Mobile AIS station"},
    {id: "AB", desc: "NMEA 4.0 base AIS station"},
    {id: "AD", desc: "NMEA 4.0 dependent AIS base station"},
    {id: "AN", desc: "NMEA 4.0 aid to navigation AIS station"},
    {id: "AR", desc: "NMEA 4.0 AIS receiving station"},
    {id: "AS", desc: "NMEA 4.0 limited base station"},
    {id: "AT", desc: "NMEA 4.0 AIS transmitting station"},
    {id: "AX", desc: "NMEA 4.0 repeater AIS station"},
    {id: "BS", desc: "Base AIS station "},
    {id: "SA", desc: "NMEA 4.0 physical shore AIS station"}
];
                                           
const messageType_enum = [
    unexpected, //0
    "Position Report Class A", //1
    "Position Report Class A (Assigned schedule)", //2
    "Position Report Class A (Response to interrogation)", //3
    "Base Station Report", //4
    "Static and Voyage Related Data", //5
    "Binary Addressed Message", //6
    "Binary Acknowledge", //7
    "Binary Broadcast Message", //8
    "Standard SAR Aircraft Position Report", //9
    "UTC and Date Inquiry", //10
    "UTC and Date Response", //11
    "Addressed Safety Related Message", //12
    "Safety Related Acknowledgement", //13
    "Safety Related Broadcast Message", //14
    "Interrogation", //15
    "Assignment Mode Command", //16
    "DGNSS Binary Broadcast Message", //17
    "Standard Class B CS Position Report", //18
    "Extended Class B Equipment Position Report", //19
    "Data Link Management", //20
    "Aid-to-Navigation Report", //21
    "Channel Management", //22
    "Group Assignment Command", //23
    "Static Data Report", //24
    "Single Slot Binary Message", //25
    "Multiple Slot Binary Message With Communications State", //26
    "Position Report For Long-Range Applications" //27
];

const navigationStatus_enum = [
    "Under way using engine",
    "At anchor",
    "Not under command",
    "Restricted manoeuverability",
    "Constrained by her draught",
    "Moored",
    "Aground",
    "Engaged in Fishing",
    "Under way sailing",
    "Reserved for future amendment of Navigational Status for HSC",
    "Reserved for future amendment of Navigational Status for WIG",
    reserved,
    reserved,
    reserved,
    "AIS-SART is active",
    "Not defined"
];

const turningDirection_enum = [
    "Turning left", // -1
    "Not turning",  //  0
    "Turning right" //  1
];

const positionAccuracy_enum = [
    "Unaugmented GNSS fix with uncertainty more than 10m",
    "DGPS-quality fix with an accuracy of better than 10m"
];
                                           
const positioningSystemStatus_enum = [
    unexpected,
    "Manual input mode",
    "Dead reckoning mode",
    "Inoperative"
];

const manoeuvre_enum = [
    unexpected,
    "no special manoeuvre",
    "special manoeuvre"
];
                                           
const shipType_enum = [
    unexpected, // 0
    reserved,   // 1
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,
    reserved,   //19
    "Wing in ground", //20
    "Wing in ground (WIG), Hazardous category A",
    "Wing in ground (WIG), Hazardous category B",
    "Wing in ground (WIG), Hazardous category C",
    "Wing in ground (WIG), Hazardous category D",
    "Wing in ground (WIG), "+reserved,
    "Wing in ground (WIG), "+reserved,
    "Wing in ground (WIG), "+reserved,
    "Wing in ground (WIG), "+reserved,
    "Wing in ground (WIG), "+reserved, //29
    "Fishing",
    "Towing",
    "Towing: length exceeds 200m or breadth exceeds 25m",
    "Dredging or underwater operations",
    "Diving operations",
    "Military operations",
    "Sailing",
    "Pleasure craft",
    reserved,
    reserved, //39
    "High speed craft", //40
    "High speed craft (HSC), Hazardous category A",
    "High speed craft (HSC), Hazardous category B",
    "High speed craft (HSC), Hazardous category C",
    "High speed craft (HSC), Hazardous category D",
    "High speed craft (HSC), "+reserved,
    "High speed craft (HSC), "+reserved,
    "High speed craft (HSC), "+reserved,
    "High speed craft (HSC), "+reserved,
    "High speed craft (HSC), No additional information",
    "Pilot vessel", //50
    "Search and rescue vessel",
    "Tug",
    "Port tender",
    "Anti-pollution equipment",
    "Law enforcement",
    "Spare - Local Vessel",
    "Spare - Local Vessel",
    "Medical transport",
    "Noncombatant ship according to RR Resolution No. 18",
    "Passenger", //60
    "Passenger, Hazardous category A",
    "Passenger, Hazardous category B",
    "Passenger, Hazardous category C",
    "Passenger, Hazardous category D",
    "Passenger, "+reserved,
    "Passenger, "+reserved,
    "Passenger, "+reserved,
    "Passenger, "+reserved,
    "Passenger, No additional information",
    "Cargo", //70
    "Cargo, Hazardous category A",
    "Cargo, Hazardous category B",
    "Cargo, Hazardous category C",
    "Cargo, Hazardous category D",
    "Cargo, "+reserved,
    "Cargo, "+reserved,
    "Cargo, "+reserved,
    "Cargo, "+reserved,
    "Cargo, No additional information",
    "Tanker", //80
    "Tanker, Hazardous category A",
    "Tanker, Hazardous category B",
    "Tanker, Hazardous category C",
    "Tanker, Hazardous category D",
    "Tanker, "+reserved,
    "Tanker, "+reserved,
    "Tanker, "+reserved,
    "Tanker, "+reserved,
    "Tanker, No additional information",
    "Other", //90
    "Other, Hazardous category A",
    "Other, Hazardous category B",
    "Other, Hazardous category C",
    "Other, Hazardous category D",
    "Other, "+reserved,
    "Other, "+reserved,
    "Other, "+reserved,
    "Other, "+reserved,
    "Other, No additional information",
];

const fixType_enum = [
    unexpected,
    "GPS",
    "GLONASS",
    "Combined GPS/GLONASS",
    "Loran-C",
    "Chayka",
    "Integrated navigation system",
    "Surveyed",
    "Galileo",
];

const navAid_enum = [
    unexpected,
    "Reference point",
    "RACON (radar transponder marking a navigation hazard)",
    "Fixed structure off shore, such as oil platforms, wind farms, rigs",
    "Spare, Reserved for future use.",
    "Light, without sectors",
    "Light, with sectors",
    "Leading Light Front",
    "Leading Light Rear",
    "Beacon, Cardinal N",
    "Beacon, Cardinal E",
    "Beacon, Cardinal S",
    "Beacon, Cardinal W",
    "Beacon, Port hand",
    "Beacon, Starboard hand",
    "Beacon, Preferred Channel port hand",
    "Beacon, Preferred Channel starboard hand",
    "Beacon, Isolated danger",
    "Beacon, Safe water",
    "Beacon, Special mark",
    "Cardinal Mark N",
    "Cardinal Mark E",
    "Cardinal Mark S",
    "Cardinal Mark W",
    "Port hand Mark",
    "Starboard hand Mark",
    "Preferred Channel Port hand",
    "Preferred Channel Starboard hand",
    "Isolated danger",
    "Safe Water",
    "Special Mark",
    "Light Vessel / LANBY / Rigs"
];

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
	var m = [];     // List of messages to send on decode output
    var e = [];     // List of messages to send on error output
    var result;
    var i;
    var f = [];
	var ff = msg.payload.split('\r');
    // Remove empty fragments
    for (i=0;i<ff.length;i++) {
        ff[i] = ff[i].trim();
        if (ff[i].length>0) {
            f.push(ff[i]);
        }
    }
    // Process each fragment in turn
	for (i=0;i<f.length;i++) {
        result = processFragment(node,f[i]);
        if (result===null) {
            // No message needs to be sent
            continue;
        }
        if (msg===null) {
            msg = {};
        }
        msg.payload = result;
        if (result.aisError) {
            // Error - add a message to the error output queue
            e.push(msg);
        } else {
            // We have a payload to send - add a message to the decode output queue
            m.push(msg);
        }
        msg = null;
    }
    if (m.length>0 || e.length>0) {
        var mm = [m,e];
        node.send(mm);
    }
}

//
// Parse and decode a single fragment, and return a payload to be put into a message
// If fragment is a non-final part of a multi-fragment sentence, store the
// fragment for later and return null.
//
function processFragment(node,f) {
    var err = {};
    var frags,i,orig;
    var result = {};
    var frag = parseFragment(f,err);
    if (frag===null) {
        // Parse error
        result = {"aisOriginal": f, "aisError": err.reason};
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
        result = {"aisOriginal": orig, "aisError": err.reason};
        return result;
    }
    // aisOriginal should have all the fragments of the sentence
    result.aisOriginal = reconstructFragments(frags);
    return result;
}

//
// Reconstruct a string containing the original fragments
//
function reconstructFragments(frags) {
    var result = "";
    var i;
    for (i=0;i<frags.length;i++) {
        if (i>0) result += "\n";
        result += frags[i].fOriginal;
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
	if (f[0]!="!AIVDM") {
        err.reason = "Not an AIVDM message: "+f[0];
		return null;
	}
	result.fHead = f[0];
	result.fCount = parseInt(f[1], 10);
	result.fNumber = parseInt(f[2], 10);
	if (result.fCount==NaN || result.fNumber==NaN) {
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
	if (result.fFillBits==NaN || result.fFillBits<0 || result.fFillBits>5) {
        err.reason = "Invalid number of fill bits";
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
        // Insufficient data
        err.reason = "Insufficient data in payload";
        return null;
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
            err.reason = extractPositionReportA(aisData,binPayload,nBits);
            break;
        case 5:
            err.reason = extractStaticReport(aisData,binPayload,nBits);
            break;
        case 9:
            err.reason = extractSarReport(aisData,binPayload,nBits);
            break;
        case 18:
        case 19:
            err.reason = extractPositionReportB(aisData,binPayload,nBits);
            break;
        default:
            err.reason = "Unrecognised AIS message type " + aisData.aisType;
            break;
    }
	// Did we encounter an error?
    if (err.reason.length>0) {
        return null;
    }
	return aisData;
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
// Decode position report type A. Update the ais data object, and return
// empty string, or error string.
//
function extractPositionReportA(aisData,binPayload,nBits) {
    if (nBits<167) {
        // Insufficient data in the payload for this message type
        return "Insufficient data in payload";
    }
    aisData.aisNavigationStatus = extractInt(binPayload,38,4);
    var rot = extractInt(binPayload,42,8);
    if (rot!=128) {
        // Rate of turn information is available
        decodeRateOfTurn(aisData,rot);
    }
    var speed = extractInt(binPayload,50,10);
    if (speed!=1023) {
        // Speed information is available
        aisData.aisSpeedOverGround = speed/10.0;
    }
    aisData.aisPositionAccuracy = extractInt(binPayload,60,1);
    var long = extractInt(binPayload,61,28,true);
    if (long!=0x6791AC0) {
        // Longitude information available
        aisData.aisLongitude = long/600000.0;
    }
    var lat = extractInt(binPayload,89,27,true);
    if (lat!=0x3412140) {
        // Latitude information available
        aisData.aisLatitude = lat/600000.0;
    }
    var cog = extractInt(binPayload,116,12);
    if (cog!=3600) {
        // Course over ground available
        aisData.aisCourseOverGround = cog/10.0;
    }
    var tHead = extractInt(binPayload,128,9);
    if (tHead!=511) {
        // True heading available
        aisData.aisTrueHeading = tHead;
    }
    var tStamp = extractInt(binPayload,137,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.aisTimeStampSeconds = tStamp;
    } else
    if (tStamp<=63) {
        // Positioning system info available
        aisData.aisPositioningSystemStatus = tStamp-60;
    }
    var man = extractInt(binPayload,143,2);
    if (man!=0) {
        // Manoeuvre data available
        aisData.aisManoeuvre = man;
    }
    aisData.aisRaim = extractInt(binPayload,148,1);
    return "";
}

//
// Decode position report type B. Update the ais data object, and return
// empty string, or error string.
//
function extractPositionReportB(aisData,binPayload,nBits) {
    if (nBits<148) {
        // Insufficient data in the payload for this message type
        return "Insufficient data in payload";
    }
    var speed = extractInt(binPayload,46,10);
    if (speed!=1023) {
        // Speed information is available
        aisData.aisSpeedOverGround = speed/10.0;
    }
    aisData.aisPositionAccuracy = extractInt(binPayload,56,1);
    var long = extractInt(binPayload,57,28,true);
    if (long!=0x6791AC0) {
        // Longitude information available
        aisData.aisLongitude = long/600000.0;
    }
    var lat = extractInt(binPayload,85,27,true);
    if (lat!=0x3412140) {
        // Latitude information available
        aisData.aisLatitude = lat/600000.0;
    }
    var cog = extractInt(binPayload,112,12);
    if (cog!=3600) {
        // Course over ground available
        aisData.aisCourseOverGround = cog/10.0;
    }
    var tHead = extractInt(binPayload,124,9);
    if (tHead!=511) {
        // True heading available
        aisData.aisTrueHeading = tHead;
    }
    var tStamp = extractInt(binPayload,133,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.aisTimeStampSeconds = tStamp;
    } else
    if (tStamp<=63) {
        // Positioning system info available
        aisData.aisPositioningSystemStatus = tStamp-60;
    }
    if (aisData.aisType==19) {
        // Extended message
        if (nBits<306) {
            return "Insufficient data in payload";
        }
        aisData.aisName = extractString(binPayload,143,120).trim();
        aisData.aisName = trimTrailingAt(aisData.aisName);
        aisData.aisShipType = extractInt(binPayload,263,8);
        aisData.aisDimensionToBow = extractInt(binPayload,271,9);
        aisData.aisDimensionToStern = extractInt(binPayload,280,9);
        aisData.aisDimensionToPort = extractInt(binPayload,289,6);
        aisData.aisDimensionToStarboard = extractInt(binPayload,295,6);
        aisData.aisFixType = extractInt(binPayload,301,4);
        aisData.aisRaim = extractInt(binPayload,305,1);
    } else {
        aisData.aisRaim = extractInt(binPayload,147,1);
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
            aisData.aisTurningDirection = 0;   // Not turning
            break;
        case 0x80:
            break;                   // No turning information available
        case 0x7F:
            aisData.aisTurningDirection = 1;   // Turning right
            break
        case 0x81:
            aisData.aisTurningDirection = -1;  // Turning left
            break;
        default:
            if ((rot & 0x80) == 0x80) {
                rot = rot - 256;
                aisData.aisTurningDirection = -1;
            } else {
                aisData.aisTurningDirection = 1;
            }
            aisData.aisTurningRate = Math.pow(rot/4.733,2).toFixed();
            break;
    }
}

//
// Decode static and voyage-related data. Update the ais data object, and return
// empty string, or error string.
//
function extractStaticReport(aisData,binPayload,nBits) {
    if (nBits<420) {
        // Insufficient data in the payload for this message type
        return "Insufficient data in payload";
    }
    aisData.aisVersion = extractInt(binPayload,38,2);
    aisData.aisShipId = extractInt(binPayload,40,30);
    aisData.aisCallsign = extractString(binPayload,70,42).trim();
    aisData.aisCallsign = trimTrailingAt(aisData.aisCallsign);
    aisData.aisName = extractString(binPayload,112,120).trim();
    aisData.aisName = trimTrailingAt(aisData.aisName);
    aisData.aisShipType = extractInt(binPayload,232,8);
    aisData.aisDimensionToBow = extractInt(binPayload,240,9);
    aisData.aisDimensionToStern = extractInt(binPayload,249,9);
    aisData.aisDimensionToPort = extractInt(binPayload,249,6);
    aisData.aisDimensionToStarboard = extractInt(binPayload,264,6);
    aisData.aisFixType = extractInt(binPayload,270,4);
    // Create a Date with the ETA
    var mo = extractInt(binPayload,274,4);
    var da = extractInt(binPayload,278,5);
    var ho = extractInt(binPayload,283,5);
    var mi = extractInt(binPayload,288,6);
    aisData.aisEta = new Date();
    var tm = aisData.aisEta.getMonth()+1;
    if (tm>=11 && mo<=2) {
        // ETA is probably next year
        var ty = aisData.aisEta.getFullYear();
        ty++;
        aisData.aisEta.setFullYear(ty);
    }
    aisData.aisEta.setMonth(mo-1);
    aisData.aisEta.setDate(da);
    aisData.aisEta.setHours(ho);
    aisData.aisEta.setMinutes(mi);
    aisData.aisEta.setSeconds(0);
    aisData.aisDraught = extractInt(binPayload,294,8)/10.0;
    var d = nBits-302;
    if (d>120) {
        d = 120;
    }
    aisData.aisDestination = extractString(binPayload,302,d).trim();
    aisData.aisDestination = trimTrailingAt(aisData.aisDestination);
    return "";
}

//
// Trim trailing @ sign from string. Must be a simpler way to do this...
//
function trimTrailingAt(str) {
    var i = str.length;
    var found = false;
    while (i>0 && str.charAt(i-1)=="@") {
        i--;
        found = true;
    }
    if (i==0 && !found) return str;
    return str.slice(0,i);
}

//
// Decode SAR aircraft position report. Update the ais data object, and return
// empty string, or error string.
//
function extractSarReport(aisData,binPayload,nBits) {
    if (nBits<147) {
        // Insufficient data in the payload for this message type
        return "Insufficient data in payload";
    }
    var alt = extractInt(binPayload,38,12);
    if (alt!=4095) {
        aisData.aisAltitude = alt;
    }
    var speed = extractInt(binPayload,50,10);
    if (speed!=1023) {
        // Speed information is available
        aisData.aisSpeedOverGround = speed*1.0;
    }
    aisData.aisPositionAccuracy = extractInt(binPayload,60,1);
    var long = extractInt(binPayload,61,28,true);
    if (long!=0x6791AC0) {
        // Longitude information available
        aisData.aisLongitude = long/600000.0;
    }
    var lat = extractInt(binPayload,89,27,true);
    if (lat!=0x3412140) {
        // Latitude information available
        aisData.aisLatitude = lat/600000.0;
    }
    var cog = extractInt(binPayload,116,12);
    if (cog!=3600) {
        // Course over ground available
        aisData.aisCourseOverGround = cog/10.0;
    }
    var tStamp = extractInt(binPayload,128,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.aisTimeStampSeconds = tStamp;
    } else
    if (tStamp<=63) {
        // Positioning system info available
        aisData.aisPositioningSystemStatus = tStamp-60;
    }
    aisData.aisRaim = extractInt(binPayload,148,1);
    return "";
}

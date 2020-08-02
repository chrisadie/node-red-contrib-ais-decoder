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
}

function processMessage(node,msg) {
    var result = {};
    var f;
    f = msg.payload.trim();
    if (f.length>0) {
        result = processFragment(node,f);
        if (result===null) {
            result = {"resultCode": 2};
        } else {
            if (result.errorInfo) {
                result.resultCode = 3;
            } else {
                result.resultCode = 0;
            }
        }
    } else {
        result = {"resultCode": 1};
    }
    msg.payload = result;
    node.send(msg);
}

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
	if (result.fFillBits==NaN || result.fFillBits<0 || result.fFillBits>6) {
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
        err.reason = "Cannot decode common data block: insufficient data in payload. Expected at least 37, only found  " + nBits;
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
// Decode position report type A. Update the ais data object, and return
// empty string, or error string.
//
function extractPositionReportA(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,149);
    if (lenerr.length>0) {
        return lenerr;
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
    var lenerr = checkPayloadLength(aisData,nBits,148);
    if (lenerr.length>0) {
        return lenerr;
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
        lenerr = checkPayloadLength(aisData,nBits,306);
        if (lenerr.length>0) {
            return lenerr;
        }
        aisData.aisName = extractString(binPayload,143,120).trim();
        aisData.aisName = normaliseString(aisData.aisName);
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
    var lenerr = checkPayloadLength(aisData,nBits,420);
    if (lenerr.length>0) {
        return lenerr;
    }
    aisData.aisVersion = extractInt(binPayload,38,2);
    aisData.aisShipId = extractInt(binPayload,40,30);
    aisData.aisCallsign = extractString(binPayload,70,42).trim();
    aisData.aisCallsign = normaliseString(aisData.aisCallsign);
    aisData.aisName = extractString(binPayload,112,120).trim();
    aisData.aisName = normaliseString(aisData.aisName);
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
    aisData.aisDestination = normaliseString(aisData.aisDestination);
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
// Decode SAR aircraft position report. Update the ais data object, and return
// empty string, or error string.
//
function extractSarReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,147);
    if (lenerr.length>0) {
        return lenerr;
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

//
// Decode base station report. Update the ais data object, and return
// empty string, or error string.
//
function extractBaseStationReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,149);
    if (lenerr.length>0) {
        return lenerr;
    }
    var y = extractInt(binPayload,38,14);
    var mo = extractInt(binPayload,52,4);
    var d = extractInt(binPayload,56,5);
    var h = extractInt(binPayload,61,5);
    var mi = extractInt(binPayload,66,6);
    var s = extractInt(binPayload,72,6);
    aisData.aisBaseTime = new Date(y,mo-1,d,h,mi,s,0);
    aisData.aisPositionAccuracy = extractInt(binPayload,78,1);
    var long = extractInt(binPayload,79,28,true);
    if (long!=0x6791AC0) {
        // Longitude information available
        aisData.aisLongitude = long/600000.0;
    }
    var lat = extractInt(binPayload,107,27,true);
    if (lat!=0x3412140) {
        // Latitude information available
        aisData.aisLatitude = lat/600000.0;
    }
    aisData.aisFixType = extractInt(binPayload,134,4);
    aisData.aisRaim = extractInt(binPayload,148,1);
    return "";
}

//
// Decode binary addressed message. Update the ais data object, and return
// empty string, or error string.
//
function extractBinaryAddressedMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,88);
    if (lenerr.length>0) {
        return lenerr;
    }
    aisData.aisSequenceNumber = extractInt(binPayload,38,2);
    var mmsi = extractInt(binPayload,40,30);
    aisData.aisDestinationMmsi = padLeft(mmsi.toString(),"0",9);
    aisData.aisRetransmitted = extractInt(binPayload,70,1);
    aisData.aisDesignatedAreaCode = extractInt(binPayload,72,10);
    aisData.aisFunctionalId = extractInt(binPayload,82,6);
    var binLength = nBits - 88;
    if (binLength>920) binLength = 920;
    if (binLength>0) {
        aisData.aisBinaryData = extractBinary(binPayload,88,binLength);
        // ToDo: interpret binary data where possible
    }
    return "";
}
                                              
//
// Decode binary broadcast message. Update the ais data object, and return
// empty string, or error string.
//
function extractBinaryBroadcastMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,56);
    if (lenerr.length>0) {
        return lenerr;
    }
    aisData.aisDesignatedAreaCode = extractInt(binPayload,40,10);
    aisData.aisFunctionalId = extractInt(binPayload,50,6);
    var binLength = nBits - 56;
    if (binLength>952) binLength = 952;
    if (binLength>0) {
        aisData.aisBinaryData = extractBinary(binPayload,56,binLength);
        // ToDo: interpret binary data where possible
    }
    return "";
}

//
// Decode DGNSS broadcast message. Update the ais data object, and return
// empty string, or error string.
//
function extractDgnssBroadcastBinaryMessage(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,80);
    if (lenerr.length>0) {
        return lenerr;
    }
    var long = extractInt(binPayload,40,18,true);
    if (long!=0x01a838) {
        // Longitude information available
        aisData.aisLongitude = long/600.0;
    }
    var lat = extractInt(binPayload,58,17,true);
    if (lat!= 0x00d548) {
        // Latitude information available
        aisData.aisLatitude = lat/600.0;
    }
    var binLength = nBits - 80;
    if (binLength>736) binLength = 736;
    if (binLength>0) {
        aisData.aisBinaryData = extractBinary(binPayload,80,binLength);
    }
    return "";
}

//
// Decode Aid-to-navigation message. Update the ais data object, and return
// empty string, or error string.
//
function extractAidToNavigationReport(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,272);
    if (lenerr.length>0) {
        return lenerr;
    }
    aisData.aisNavAid = extractInt(binPayload,38,5);
    var n = extractString(binPayload,43,120);
    if (n.length>0) {
        if (n.charAt(n.length-1)=="@") {
            // Need to look at name extension field
            if (nBits>272) {
                n += extractString(binPayload,272,nBits-272);;
            }
        }
    }
    aisData.aisName = normaliseString(n.trim());
    aisData.aisPositionAccuracy = extractInt(binPayload,163,1);
    var long = extractInt(binPayload,164,28,true);
    if (long!=0x6791AC0) {
        // Longitude information available
        aisData.aisLongitude = long/600000.0;
    }
    var lat = extractInt(binPayload,192,27,true);
    if (lat!=0x3412140) {
        // Latitude information available
        aisData.aisLatitude = lat/600000.0;
    }
    aisData.aisDimensionToBow = extractInt(binPayload,219,9);
    aisData.aisDimensionToStern = extractInt(binPayload,228,9);
    aisData.aisDimensionToPort = extractInt(binPayload,237,6);
    aisData.aisDimensionToStarboard = extractInt(binPayload,243,6);
    aisData.aisFixType = extractInt(binPayload,249,4);
    var tStamp = extractInt(binPayload,253,6);
    if (tStamp<60) {
        // Timestamp available
        aisData.aisTimeStampSeconds = tStamp;
    } else
    if (tStamp<=63) {
        // Positioning system info available
        aisData.aisPositioningSystemStatus = tStamp-60;
    }
    aisData.aisOffPosition = extractInt(binPayload,259,1);
    aisData.aisRaim = extractInt(binPayload,268,1);
    aisData.aisVirtualAid = extractInt(binPayload,269,1);
    aisData.aisAssignedMode = extractInt(binPayload,270,1);
    return "";
}

//
// Decode UTC enquiry message. Update the ais data object, and return
// empty string, or error string.
//
function extractUtcEnquiry(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,72);
    if (lenerr.length>0) {
        return lenerr;
    }
    var mmsi = extractInt(binPayload,40,30);
    aisData.aisDestinationMmsi = padLeft(mmsi.toString(),"0",9);
    return "";
}

//
// Decode type 24 message. Update the ais data object, and return
// empty string, or error string.
//
function extractStaticReport24(aisData,binPayload,nBits) {
    var lenerr = checkPayloadLength(aisData,nBits,40);
    if (lenerr.length>0) {
        return lenerr;
    }
    var part = extractInt(binPayload,38,2);
    switch (part) {
        case 0:
            aisData.aisType24Part = "A";
            lenerr = checkPayloadLength(aisData,nBits,160);
            if (lenerr.length>0) {
                return lenerr;
            }
            aisData.aisName = extractString(binPayload,40,120).trim();
            aisData.aisName = normaliseString(aisData.aisName);
            return "";
        case 1:
            aisData.aisType24Part = "B";
            lenerr = checkPayloadLength(aisData,nBits,168);
            if (lenerr.length>0) {
                return lenerr;
            }
            aisData.aisShipType = extractInt(binPayload,40,8);
            aisData.aisVendorId = extractString(binPayload,48,42).trim();
            aisData.aisVendorId = normaliseString(aisData.aisVendorId);
            aisData.aisUnitModelCode = extractInt(binPayload,66,4);
            aisData.aisUnitSerialNumber = extractInt(binPayload,70,20);
            aisData.aisCallsign = extractString(binPayload,90,42).trim();
            aisData.aisCallsign = normaliseString(aisData.aisCallsign);
            aisData.aisDimensionToBow = extractInt(binPayload,132,9);
            aisData.aisDimensionToStern = extractInt(binPayload,141,9);
            aisData.aisDimensionToPort = extractInt(binPayload,150,6);
            aisData.aisDimensionToStarboard = extractInt(binPayload,156,6);
            var mmsi = extractInt(binPayload,132,30);
            aisData.aisMothershipMmsi = padLeft(mmsi.toString(),"0",9);
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
    // ToDo: decode single slot binary message
    return "";
}

//
// Check for an erroneous payload length
//
function checkPayloadLength(aisData,nBits,minimum) {
    if (nBits<minimum) {
        return "Cannot decode message type "+aisData.aisType+": insufficient data in payload. Expected at least "+minimum+", only found "+nBits;
    }
    return "";
}

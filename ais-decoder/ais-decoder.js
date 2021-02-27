/**
* Copyright (C) 2020 Chris Adie
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
        msg.originalAisMessage = result.aisOriginal;
        delete result.aisOriginal;
        msg.payload = result;
        msg.payload.talkerId = msg.originalAisMessage[0].slice(1,3);
        msg.payload.sentenceId = msg.originalAisMessage[0].slice(3,6);
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
  var frags,orig;
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
    if (item.length>0 && !item[0].unwanted && !item[0].complete && item[0].fCount==frag.fCount && item[0].fMessageId==frag.fMessageId && item[0].fRadioChannel==frag.fRadioChannel) {
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
  var aisData = {"channel": frags[0].fRadioChannel};
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
    case 15:
    err.reason = extractInterrogation(aisData,binPayload,nBits);
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
  for (i=0;i<nBits;i++) {
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
  var offset, theBit, bitOffset, i, nobble;
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
// Extract longitude from payload
//
function extractLong(binPayload,start,n) {
  var long = extractInt(binPayload,start,n,true);
  if (n==28) {
    if (long==0x6791AC0) {
      return undefined;
    }
    return long/600000.0;
  }
  if (n==25) {
    if (long==0xFFFFFF) {
      return undefined;
    }
    return long/60000.0;
  }
  if (n==18) {
    if (long==0x01a838) {
      return undefined;
    }
    return long/600.0;
  }
  return undefined;
}

//
// Extract latitude from payload
//
function extractLat(binPayload,start,n) {
  var lat = extractInt(binPayload,start,n,true);
  if (n==27) {
    if (lat==0x3412140) {
      return undefined;
    }
    return lat/600000.0;
  }
  if (n==24) {
    if (lat== 0x7FFFFF) {
      return undefined;
    }
    return lat/60000.0;
  }
  if (n==17) {
    if (lat== 0x00d548) {
      return undefined;
    }
    return lat/600.0;
  }
  return undefined;
}

//
// Extract lat and long from payload
//
function extractLatLong(aisData,binPayload,start) {
  aisData.longitude = extractLong(binPayload,start,28);
  aisData.latitude = extractLat(binPayload,start+28,27);
}

//
// Extract dimensions from payload
//
function extractDimensions(aisData,binPayload,start) {
  var d = extractInt(binPayload,start,9);
  if (d!=0) aisData.dimensionToBow = d;
  start += 9;
  d = extractInt(binPayload,start,9);
  if (d!=0) aisData.dimensionToStern = d;
  start += 9;
  d = extractInt(binPayload,start,6);
  if (d!=0) aisData.dimensionToPort = d;
  start += 6;
  d = extractInt(binPayload,start,6);
  if (d!=0) aisData.dimensionToStarboard = d;
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
  var n = extractInt(binPayload,38,4);
  if (n!=15) {
    aisData.navigationStatus = n;
  }
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
  aisData.positionAccurate = Boolean(extractInt(binPayload,60,1));
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
  if (nBits>149) {
    aisData.radioStatus = extractBinary(binPayload,149,nBits-149);
  }
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
  aisData.positionAccurate = Boolean(extractInt(binPayload,56,1));
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
    lenerr = checkPayloadLength(aisData,nBits,307);
    if (lenerr) {
      return lenerr;
    }
    aisData.name = extractString(binPayload,143,120).trim();
    aisData.name = normaliseString(aisData.name);
    aisData.shipType = extractInt(binPayload,263,8);
    extractDimensions(aisData,binPayload,271);
    aisData.fixType = extractFixType(binPayload,301);
    aisData.raim = Boolean(extractInt(binPayload,305,1));
    aisData.dte = Boolean(extractInt(binPayload,306,1));
    aisData.assignedMode = Boolean(extractInt(binPayload,307,1));
  } else {
    aisData.assignedMode = Boolean(extractInt(binPayload,146,1));
    aisData.raim = Boolean(extractInt(binPayload,147,1));
    if (nBits>148) {
      aisData.radioStatus = extractBinary(binPayload,148,nBits-148);
    }
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
// Decode fix type, returning undefined if result is 15
//
function extractFixType(binPayload,start) {
  var ft = extractInt(binPayload,start,4);
  if (ft==15) return undefined;
  return ft;
}

//
// Decode static and voyage-related data (message type 5).
//
function extractStaticReport(aisData,binPayload,nBits) {
  var lenerr = checkPayloadLength(aisData,nBits,422);
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
  extractDimensions(aisData,binPayload,240);
  aisData.fixType = extractFixType(binPayload,270);
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
  aisData.dte = Boolean(extractInt(binPayload,422,1));
  return "";
}

//
// Replace one or more @ with spaces, then trim trailing space.
// Return undefined if empty.
//
function normaliseString(str) {
  var result = str.replace(/@/g," ");
  result = result.trim();
  if (result=="") return undefined;
  return result;
}

//
// Decode SAR aircraft position report (message type 9).
//
function extractSarReport(aisData,binPayload,nBits) {
  var lenerr = checkPayloadLength(aisData,nBits,148);
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
  aisData.positionAccurate = Boolean(extractInt(binPayload,60,1));
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
  aisData.dte = Boolean(extractInt(binPayload,142,1));
  aisData.assignedMode = Boolean(extractInt(binPayload,146,1));
  aisData.raim = Boolean(extractInt(binPayload,147,1));
  if (nBits>148) {
    aisData.radioStatus = extractBinary(binPayload,148,nBits-148);
  }
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
  aisData.positionAccurate = Boolean(extractInt(binPayload,78,1));
  extractLatLong(aisData,binPayload,79);
  aisData.fixType = extractFixType(binPayload,134);
  aisData.raim = Boolean(extractInt(binPayload,148,1));
  if (nBits>149) {
    aisData.radioStatus = extractBinary(binPayload,149,nBits-149);
  }
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
  if (nBits>88) {
    if (nBits>88+920) nBits = 88+920;
    interpretBinaryData(aisData,binPayload,88,nBits);
  }
  return "";
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
  if (nBits>56) {
    if (nBits>56+952) nBits = 56+952;
    interpretBinaryData(aisData,binPayload,56,nBits);
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
    aisData.dgnssCorrection = extractBinary(binPayload,80,binLength);
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
  aisData.name = normaliseString(n);
  aisData.positionAccurate = Boolean(extractInt(binPayload,163,1));
  extractLatLong(aisData,binPayload,164);
  extractDimensions(aisData,binPayload,219);
  aisData.fixType = extractFixType(binPayload,249);
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
    aisData.messageSubtype = "A";
    aisData.messageSubtype_text = "Part A";
    lenerr = checkPayloadLength(aisData,nBits,160);
    if (lenerr) {
      return lenerr;
    }
    aisData.name = extractString(binPayload,40,120).trim();
    aisData.name = normaliseString(aisData.name);
    return "";
    case 1:
    aisData.messageSubtype = "B";
    aisData.messageSubtype_text = "Part B";
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
    if (aisData.senderMmsi.indexOf("98")!=0) {
      extractDimensions(aisData,binPayload,132);
    } else {
      var mmsi = extractInt(binPayload,132,30);
      aisData.mothershipMmsi = padLeft(mmsi.toString(),"0",9);
    }
    return "";
    default:
    return "Invalid part indicator in type 24 message";
  }
}

//
// Decode type 20 message.
//
function extractDataLinkManagement(aisData,binPayload,nBits) {
  aisData.offset = [];
  aisData.number = [];
  aisData.timeout = [];
  aisData.increment = [];
  var start = 40;
  var i = 0;
  while (start<nBits && i<4) {
    aisData.offset[i] = extractInt(binPayload,start,12);
    aisData.number[i] = extractInt(binPayload,start+12,4);
    aisData.timeout[i] = extractInt(binPayload,start+16,3);
    aisData.increment[i] = extractInt(binPayload,start+19,11);
    start += 30;
    i++;
  }
  return "";
}

//
// Decode type 22 message.
//
function extractChannelManagement(aisData,binPayload,nBits) {
  var lenerr = checkPayloadLength(aisData,nBits,145);
  if (lenerr) {
    return lenerr;
  }
  aisData.channelA = extractInt(binPayload,40,12);
  aisData.channelB = extractInt(binPayload,52,12);
  aisData.txrxMode = extractInt(binPayload,64,4);
  aisData.highPower = Boolean(extractInt(binPayload,68,1));
  var addressed = extractInt(binPayload,139,1);
  if (addressed) {
    var m = extractInt(binPayload,69,30);
    aisData.mmsi[0] = padLeft(m.toString(),"0",9);
    m = extractInt(binPayload,104,30);
    aisData.mmsi[1] = padLeft(m.toString(),"0",9);
  } else {
    aisData.coverageEasternLimit = extractLong(binPayload,69,18);
    aisData.coverageNorthernLimit = extractLat(binPayload,87,17);
    aisData.coverageWesternLimit = extractLong(binPayload,104,18);
    aisData.coverageSouthernLimit = extractLat(binPayload,122,17);
  }
  aisData.channelAbw = Boolean(extractInt(binPayload,140,1));
  aisData.channelBbw = Boolean(extractInt(binPayload,141,1));
  aisData.zoneSize = extractInt(binPayload,142,3);
  return "";
}

//
// Decode type 15 message.
//
function extractInterrogation(aisData,binPayload,nBits) {
  aisData.mmsi = [];
  aisData.offset = [];
  aisData.requestedType = [];
  var start = 40;
  var m = extractInt(binPayload,start,30);
  aisData.mmsi[0] = padLeft(m.toString(),"0",9);
  start += 30;
  aisData.requestedType[0] = extractInt(binPayload,start,6);
  start += 6;
  aisData.offset[0] = extractInt(binPayload,start,12);
  start += 12;
  start += 2;
  if (start<nBits) {
    aisData.mmsi[1] = aisData.mmsi[0];
    aisData.requestedType[1] = extractInt(binPayload,start,6);
    start += 6;
    aisData.offset[1] = extractInt(binPayload,start,12);
    start += 12;
    start += 2;
  }
  if (start<nBits) {
    m = extractInt(binPayload,start,30);
    aisData.mmsi[2] = padLeft(m.toString(),"0",9);
    start += 30;
    aisData.requestedType[2] = extractInt(binPayload,start,6);
    start += 6;
    aisData.offset[2] = extractInt(binPayload,start,12);
  }
  return "";
}

//
// Decode type 16 message.
//
function extractAssignmentModeCommand(aisData,binPayload,nBits) {
  aisData.mmsi = [];
  aisData.offset = [];
  aisData.increment = [];
  var start = 40;
  var i = 0;
  while (start<nBits && i<2) {
    var m = extractInt(binPayload,start,30);
    aisData.mmsi[i] = padLeft(m.toString(),"0",9);
    aisData.offset[i] = extractInt(binPayload,start+30,12);
    aisData.increment[i] = extractInt(binPayload,start+42,10);
    start += 52;
    i++;
  }
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
  var addressed = Boolean(extractInt(binPayload,38,1));
  var structured = Boolean(extractInt(binPayload,39,1));
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
  if (nBits>start) {
    if (structured) {
      interpretBinaryData(aisData,binPayload,start,nBits);
    } else {
      aisData.binaryData = extractBinary(binPayload,start,nBits-start);
    }
  }
  return "";
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
//

const dispatch = [
  {"mty": 6,  "dac": 0,  "fid":  0,  "func": interpret_6_0_0,   "minlen": 136, "text": "Navigation aid status"},
  {"mty": 6,  "dac": 1,  "fid":  2,  "func": interpret_6_1_2,   "minlen": 104, "text": "Capability interrogation for specified DAC/FID"},
  {"mty": 6,  "dac": 1,  "fid":  3,  "func": interpret_6_1_3,   "minlen":  98, "text": "Capability interrogation for specified DAC"},
  {"mty": 6,  "dac": 1,  "fid":  4,  "func": interpret_6_1_4,   "minlen": 224, "text": "Capability reply"},
  {"mty": 6,  "dac": 1,  "fid": 40,  "func": interpret_6_1_40,  "minlen": 101, "text": "Number of persons on board"},
  {"mty": 6,  "dac": 235,"fid": 10,  "func": interpret_6_235_10,"minlen": 136, "text": "Navigation aid status"},
  {"mty": 8,  "dac": 1,  "fid": 11,  "func": interpret_8_1_11,  "minlen": 352, "text": "Meterological and hydrological data"},
  {"mty": 8,  "dac": 1,  "fid": 16,  "func": interpret_8_1_16,  "minlen": 176, "text": "Vessel traffic services target list"},
  {"mty": 8,  "dac": 200,"fid": 10,  "func": interpret_8_200_10,"minlen": 160, "text": "Inland ship voyage-related data"},
  {"mty":25,  "dac": 1,  "fid":  0,  "func": interpret_25_1_0,  "minlen":   0, "text": "Text using 6-bit ASCII"},
];

function interpretBinaryData(aisData,binPayload,start,nBits) {
  aisData.messageSubtype = aisData.designatedAreaCode+","+aisData.functionalId;
  var i;
  for (i=0;i<dispatch.length;i++) {
    if (dispatch[i].mty==aisData.messageType && dispatch[i].dac==aisData.designatedAreaCode && dispatch[i].fid==aisData.functionalId) {
      if (dispatch[i].func===undefined) {
        break;
      }
      if (nBits<dispatch[i].minlen) {
        break;
      }
      aisData.messageSubtype_text = aisData.messageSubtype+": "+dispatch[i].text;
      dispatch[i].func(aisData,binPayload,start,nBits);
      return;
    }
  }
  aisData.binaryData = extractBinary(binPayload,start,nBits-start);
}

function interpret_6_0_0(aisData,binPayload,start,nBits) {
  aisData.subApplicationId = extractInt(binPayload,start,16);
  start += 16;
  aisData.lanternSupplyVoltage = extractInt(binPayload,start,12) * 0.1;
  start += 12;
  aisData.lanternDrainCurrent = extractInt(binPayload,start,10) * 0.1;
  start += 10;
  aisData.powerDC = Boolean(extractInt(binPayload,start,1));
  start += 1;
  aisData.lightOn = Boolean(extractInt(binPayload,start,1));
  start += 1;
  aisData.batteryLow = Boolean(extractInt(binPayload,start,1));
  start += 1;
  aisData.offPosition = Boolean(extractInt(binPayload,start,1));
}

function interpret_6_1_2(aisData,binPayload,start,nBits) {
  aisData.requestedDAC = extractInt(binPayload,start,10);
  aisData.requestedFID = extractInt(binPayload,start+10,6);
}

function interpret_6_1_3(aisData,binPayload,start,nBits) {
  aisData.requestedDAC = extractInt(binPayload,start,10);
}

function interpret_6_1_4(aisData,binPayload,start,nBits) {
  aisData.supportedFID = [];
  for (var i=0;i<64;i++) {
    aisData.supportedFID[i] = Boolean(extractInt(binPayload,start,1));
    start += 2;
  }
}

function interpret_6_1_40(aisData,binPayload,start,nBits) {
  var n = extractInt(binPayload,start,13);
  if (n) aisData.numberOfPersons = n;
}

function interpret_6_235_10(aisData,binPayload,start,nBits) {
  if (nBits>138) {
    aisData.messageSubtype_text = aisData.messageSubtype;
    aisData.binaryData = extractBinary(binPayload,start,nBits-start);
  } else {
    aisData.voltageInternal = extractInt(binPayload,start,10) * 0.05;
    start += 10;
    aisData.voltageExternal1 = extractInt(binPayload,start,10) * 0.05;
    start += 10;
    aisData.voltageExternal2 = extractInt(binPayload,start,10) * 0.05;
    start += 10;
    aisData.statusBitsInternal = extractInt(binPayload,start,5);
    start += 5;
    aisData.statusBitsExternal = extractInt(binPayload,start,8);
    start += 8;
    aisData.offPosition = Boolean(extractInt(binPayload,start,1));
  }
}

function interpret_8_1_11(aisData,binPayload,start,nBits) {
  aisData.latitude = extractLat(binPayload,start,24);
  start += 24;
  aisData.longitude = extractLong(binPayload,start,25);
  start += 25;
  var x = extractInt(binPayload,start,5);
  if (x!=0) aisData.timeStampDay = x;
  start += 5;
  x = extractInt(binPayload,start,5);
  if (x<24) aisData.timeStampHour = x;
  start += 5;
  x = extractInt(binPayload,start,6);
  if (x<60) aisData.timeStampMinute = x;
  start += 6;
  x = extractInt(binPayload,start,7);
  if (x!=127) aisData.windSpeedAverage = x;
  start += 7;
  x = extractInt(binPayload,start,7);
  if (x!=127) aisData.windSpeedGust = x;
  start += 7;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.windDirection = x;
  start += 9;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.windGustDirection = x;
  start += 9;
  x = extractInt(binPayload,start,11);
  if (x!=2047) aisData.temperature = (x-600) * 0.1;
  start += 11;
  x = extractInt(binPayload,start,7);
  if (x!=127) aisData.humidity = x;
  start += 7;
  x = extractInt(binPayload,start,10);
  if (x!=1023) aisData.dewPoint = (x-200) * 0.1;
  start += 10;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.airPressure = 800+x;
  start += 9;
  x = extractInt(binPayload,start,2);
  if (x!=3) aisData.airPressureTrend = x;
  start += 2;
  x = extractInt(binPayload,start,8);
  if (x!=255) aisData.visibility = x * 0.1;
  start += 8;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.waterLevel = (x-100)*0.1;
  start += 9;
  x = extractInt(binPayload,start,2);
  if (x!=3) aisData.waterLevelTrend = x;
  start += 2;
  x = extractInt(binPayload,start,8);
  if (x!=255) aisData.currentSpeedSurface = x * 0.1;
  start += 8;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.currentDirectionSurface = x;
  start += 9;
  x = extractInt(binPayload,start,8);
  if (x!=255) aisData.currentSpeedDepth2 = x * 0.1;
  start += 8;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.currentDirectionDepth2 = x;
  start += 9;
  x = extractInt(binPayload,start,5);
  if (x!=31) aisData.currentDepth2 = x * 0.1;
  start += 5;
  x = extractInt(binPayload,start,8);
  if (x!=255) aisData.currentSpeedDepth3 = x * 0.1;
  start += 8;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.currentDirectionDepth3 = x;
  start += 9;
  x = extractInt(binPayload,start,5);
  if (x!=31) aisData.currentDepth3 = x * 0.1;
  start += 5;
  x = extractInt(binPayload,start,8);
  if (x!=255) aisData.waveHeight = x * 0.1;
  start += 8;
  x = extractInt(binPayload,start,6);
  if (x!=63) aisData.wavePeriod = x;
  start += 6;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.waveDirection = x;
  start += 9;
  x = extractInt(binPayload,start,8);
  if (x!=255) aisData.swellHeight = x * 0.1;
  start += 8;
  x = extractInt(binPayload,start,6);
  if (x!=63) aisData.swellPeriod = x;
  start += 6;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.swellDirection = x;
  start += 9;
  x = extractInt(binPayload,start,4);
  if (x<13) aisData.seaState = x;
  start += 4;
  x = extractInt(binPayload,start,10);
  if (x!=1023) aisData.waterTemperature = (x-100) * 0.1;
  start += 10;
  x = extractInt(binPayload,start,3);
  if (x!=7) aisData.precipitationType = x;
  start += 3;
  x = extractInt(binPayload,start,9);
  if (x!=511) aisData.salinity = x * 0.1;
  start += 9;
  x = extractInt(binPayload,start,2);
  if (x<2) aisData.ice = Boolean(x);
}

function interpret_8_1_16(aisData,binPayload,start,nBits) {
  var target = [];
  var x;
  var n = (nBits - start)/120;
  if (n>7) n = 7;
  for (var i=0;i<n;i++) {
    target[i] = {};
    var id = extractInt(binPayload,start,2);
    switch (id) {
      case 0:
      x = extractInt(binPayload,start+2,42);
      target[i].mmsi = padLeft(x.toString(),"0",9);
      break;
      case 1:
      target[i].shipId = extractInt(binPayload,start+2,42);
      break;
      case 2:
      target[i].callsign = extractString(binPayload,start+2,42).trim();
      break;
      default:
      break;
    }
    target[i].latitude = extractLat(binPayload,start+48,24);
    target[i].longitude = extractLong(binPayload,start+72,25);
    x = extractInt(binPayload,start+97,9);
    if (x<360) target[i].courseOverGround = x;
    x = extractInt(binPayload,start+106,6);
    if (x<60) target[i].timeStampSeconds = x;
    x = extractInt(binPayload,start+106,8);
    if (x<250) target[i].speedOverGround = x;
    start += 120;
  }
  aisData.vtsTarget = target;
}

function interpret_8_200_10(aisData,binPayload,start,nBits) {
  aisData.europeanVesselIdentificationNumber = extractString(binPayload,start,48).trim();
  aisData.europeanVesselIdentificationNumber = normaliseString(aisData.europeanVesselIdentificationNumber);
  start += 48;
  var n = extractInt(binPayload,start,13);
  if (n!=0) aisData.lengthOfVessel = n * 0.1;
  start += 13;
  n = extractInt(binPayload,start,10);
  if (n!=0) aisData.beamOfVessel = n * 0.1;
  start += 10;
  aisData.inlandVesselType = extractInt(binPayload,start,14);
  start += 14;
  n = extractInt(binPayload,start,3);
  if (n!=5) aisData.hazardousCargo = n;
  start += 3;
  n = extractInt(binPayload,start,11);
  if (n!=0) aisData.draught = n * 0.01;
  start += 11;
  n = extractInt(binPayload,start,2);
  switch (n) {
    case 1: aisData.loaded = true; break;
    case 2: aisData.loaded = false; break;
    default: break;
  }
  start += 2;
  aisData.speedAccurate = Boolean(extractInt(binPayload,start,1));
  start += 1;
  aisData.courseAccurate = Boolean(extractInt(binPayload,start,1));
  start += 1;
  aisData.headingAccurate = Boolean(extractInt(binPayload,start,1));
}

function interpret_25_1_0(aisData,binPayload,start,nBits) {
  if (nBits<start+11) {
    aisData.messageSubtype_text = aisData.messageSubtype;
    aisData.binaryData = extractBinary(binPayload,start,nBits-start);
  } else {
    var n = extractInt(binPayload,start,11);
    if (n) aisData.textMessageSequenceNumber = n;
    start += 11;
    if (nBits>=start+6) {
      var s = extractString(binPayload,start,nBits-start).trim();
      aisData.textMessage = normaliseString(s);
    }
  }
}

//
// Add *_text fields to the message payload
//
function addTextFields(msg) {
  var i;
  msg.payload.talkerId_text = msg.payload.talkerId;
  for (i=0;i<talkerId_enum.length;i++) {
    if (talkerId_enum[i].id==msg.payload.talkerId) {
      msg.payload.talkerId_text = talkerId_enum[i].desc;
      break;
    }
  }
  msg.payload.sentenceId_text = msg.payload.sentenceId;
  for (i=0;i<sentenceId_enum.length;i++) {
    if (sentenceId_enum[i].id==msg.payload.sentenceId) {
      msg.payload.sentenceId_text = sentenceId_enum[i].desc;
      break;
    }
  }
  if (!isNaN(msg.payload.messageType)){
    msg.payload.messageType_text = textFor(messageType_enum,msg.payload.messageType);
  }
  if (!isNaN(msg.payload.navigationStatus)){
    msg.payload.navigationStatus_text = textFor(navigationStatus_enum,msg.payload.navigationStatus);
  }
  if (!isNaN(msg.payload.turningDirection)){
    msg.payload.turningDirection_text = textFor(turningDirection_enum,msg.payload.turningDirection+1);
  }
  if (!isNaN(msg.payload.positioningSystemStatus)){
    msg.payload.positioningSystemStatus_text = textFor(positioningSystemStatus_enum,msg.payload.positioningSystemStatus);
  }
  if (!isNaN(msg.payload.manoeuvre)){
    msg.payload.manoeuvre_text = textFor(manoeuvre_enum,msg.payload.manoeuvre);
  }
  if (!isNaN(msg.payload.shipType)){
    msg.payload.shipType_text = textFor(shipType_enum,msg.payload.shipType);
  }
  if (!isNaN(msg.payload.fixType)){
    msg.payload.fixType_text = textFor(fixType_enum,msg.payload.fixType);
  }
  if (!isNaN(msg.payload.navAid)){
    msg.payload.navAid_text = textFor(navAid_enum,msg.payload.navAid);
  }
  if (!isNaN(msg.payload.txrxMode)){
    msg.payload.txrxMode_text = textFor(txrxMode_enum,msg.payload.txrxMode);
  }
  if (!isNaN(msg.payload.airPressureTrend)){
    msg.payload.airPressureTrend_text = textFor(airPressureTrend_enum,msg.payload.airPressureTrend);
  }
  if (!isNaN(msg.payload.waterLevelTrend)){
    msg.payload.waterLevelTrend_text = textFor(waterLevelTrend_enum,msg.payload.waterLevelTrend);
  }
  if (!isNaN(msg.payload.precipitationType)){
    msg.payload.precipitationType_text = textFor(precipitationType_enum,msg.payload.precipitationType);
  }
  if (!isNaN(msg.payload.seaState)) {
    msg.payload.seaState_text = textFor(seaState_enum,msg.payload.seaState);
  }
  if (!isNaN(msg.payload.inlandVesselType)) {
    msg.payload.inlandVesselType_text = unexpected;
    for (i=0;i<inlandVesselType_enum.length;i++) {
      if (inlandVesselType_enum[i].id==msg.payload.inlandVesselType) {
        msg.payload.inlandVesselType_text = inlandVesselType_enum[i].desc;
        break;
      }
    }
  }
}

//
// Return descriptive text by index, or default to "unexpected".
//
function textFor(descriptions,i) {
  if (i>=0 && i<descriptions.length) {
    return descriptions[i];
  } else {
    return unexpected;
  }
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

const sentenceId_enum = [
  {id: "VDM", desc: "AIS VHF data-link message"},
  {id: "VDO", desc: "AIS VHF data-link own-vessel report"}
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

const txrxMode_enum = [
  "TxA/TxB, RxA/RxB",
  "TxA, RxA/RxB",
  "TxB, RxA/RxB",
  reserved
];

const waterLevelTrend_enum = [
  "Steady",
  "Decreasing",
  "Increasing"
];

const airPressureTrend_enum = [
  "Steady",
  "Decreasing",
  "Increasing"
];

const precipitationType_enum = [
  reserved,
  "Rain",
  "Thunderstorm",
  "Freezing rain",
  "Mixed/ice",
  "Snow",
  reserved
];

const seaState_enum = [
  "Flat.",
  "Ripples without crests.",
  "Small wavelets. Crests of glassy appearance, not breaking.",
  "Large wavelets. Crests begin to break; scattered whitecaps.",
  "Small waves.",
  "Moderate (1.2 m) longer waves. Some foam and spray.",
  "Large waves with foam crests and some spray.",
  "Sea heaps up and foam begins to streak.",
  "Moderately high waves with breaking crests forming spindrift. Streaks of foam.",
  "High waves (6-7 m) with dense foam. Wave crests start to roll over. Considerable spray.",
  "Very high waves. The sea surface is white and there is considerable tumbling. Visibility is reduced.",
  "Exceptionally high waves.",
  "Huge waves. Air filled with foam and spray. Sea completely white with driving spray. Visibility greatly reduced."
];

const inlandVesselType_enum = [
  {id: 8000,	desc: "Vessel, type unknown"},
  {id: 8010,	desc:	"Motor freighter"},
  {id: 8020,	desc: "Motor tanker"},
  {id: 8021,	desc: "Motor tanker, liquid cargo, type N"},
  {id: 8022,	desc: "Motor tanker, liquid cargo, type C"},
  {id: 8023,	desc: "Motor tanker, dry cargo as if liquid (e.g. cement)"},
  {id: 8030,	desc: "Container vessel"},
  {id: 8040,	desc: "Gas tanker"},
  {id: 8050,	desc: "Motor freighter, tug"},
  {id: 8060,	desc: "Motor tanker, tug"},
  {id: 8070,	desc: "Motor freighter with one or more ships alongside"},
  {id: 8080,	desc: "Motor freighter with tanker"},
  {id: 8090,	desc: "Motor freighter pushing one or more freighters"},
  {id: 8100,	desc: "Motor freighter pushing at least one tank-ship"},
  {id: 8110,	desc: "Tug, freighter"},
  {id: 8120,	desc: "Tug, tanker"},
  {id: 8130,	desc: "Tug, freighter, coupled"},
  {id: 8140,	desc: "Tug, freighter/tanker, coupled"},
  {id: 8150,	desc: "Freightbarge"},
  {id: 8160,	desc: "Tankbarge"},
  {id: 8161,	desc: "Tankbarge, liquid cargo, type N"},
  {id: 8162,	desc: "Tankbarge, liquid cargo, type C"},
  {id: 8163,	desc: "Tankbarge, dry cargo as if liquid (e.g. cement)"},
  {id: 8170,	desc: "Freightbarge with containers"},
  {id: 8180,	desc: "Tankbarge, gas"},
  {id: 8210,	desc: "Pushtow, one cargo barge"},
  {id: 8220,	desc: "Pushtow, two cargo barges"},
  {id: 8230,	desc: "Pushtow, three cargo barges"},
  {id: 8240,	desc: "Pushtow, four cargo barges"},
  {id: 8250,	desc: "Pushtow, five cargo barges"},
  {id: 8260,	desc: "Pushtow, six cargo barges"},
  {id: 8270,	desc: "Pushtow, seven cargo barges"},
  {id: 8280,	desc: "Pushtow, eigth cargo barges"},
  {id: 8290,	desc: "Pushtow, nine or more barges"},
  {id: 8310,	desc: "Pushtow, one tank/gas barge"},
  {id: 8320,	desc: "Pushtow, two barges at least one tanker or gas barge"},
  {id: 8330,	desc: "Pushtow, three barges at least one tanker or gas barge"},
  {id: 8340,	desc: "Pushtow, four barges at least one tanker or gas barge"},
  {id: 8350,	desc: "Pushtow, five barges at least one tanker or gas barge"},
  {id: 8360,	desc: "Pushtow, six barges at least one tanker or gas barge"},
  {id: 8370,	desc: "Pushtow, seven barges at least one tanker or gas barge"},
  {id: 8380,	desc: "Pushtow, eight barges at least one tanker or gas barge"},
  {id: 8390,	desc: "Pushtow, nine or more barges at least one tanker or gas barge"},
  {id: 8400,	desc: "Tug, single"},
  {id: 8410,	desc: "Tug, one or more tows"},
  {id: 8420,	desc: "Tug, assisting a vessel or linked combination"},
  {id: 8430,	desc: "Pushboat, single"},
  {id: 8440,	desc: "Passenger ship, ferry, red cross ship, cruise ship"},
  {id: 8441,	desc: "Ferry"},
  {id: 8442,	desc: "Red cross ship"},
  {id: 8443,	desc: "Cruise ship"},
  {id: 8444,	desc: "Passenger ship without accommodation"},
  {id: 8445,	desc: "Day-trip high speed vessel"},
  {id: 8446,	desc: "Day-trip hydrofoil vessel"},
  {id: 8447,	desc: "Sailing cruise ship"},
  {id: 8448,	desc: "Sailing passenger ship without accommodation"},
  {id: 8450,	desc: "Service vessel, police patrol, port service"},
  {id: 8451,	desc: "Service vessel"},
  {id: 8452,	desc: "Police patrol vessel"},
  {id: 8453,	desc: "Port service vessel"},
  {id: 8454,	desc: "Navigation surveillance vessel"},
  {id: 8460,	desc: "Vessel, work maintenance craft, floating derrick, cable-ship, buoy-ship, dredge"},
  {id: 8470,	desc: "Object, towed, not otherwise specified"},
  {id: 8480,	desc: "Fishing boat"},
  {id: 8490,	desc: "Bunkership"},
  {id: 8500,	desc: "Barge, tanker, chemical"},
  {id: 8510,	desc: "Object, not otherwise specified"},
  {id: 1500,	desc: "General cargo Vessel maritime"},
  {id: 1510,	desc: "Unit carrier maritime"},
  {id: 1520,	desc: "Bulk carrier maritime"},
  {id: 1530,	desc: "Tanker"},
  {id: 1540,	desc: "Liquefied gas tanker"},
  {id: 1850,	desc: "Pleasure craft, longer than 20 metres"},
  {id: 1900,	desc: "Fast ship"},
  {id: 1910,	desc: "Hydrofoil"},
  {id: 1920,	desc: "Catamaran fast"},
];

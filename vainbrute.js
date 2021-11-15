const ethers = require('ethers');
const logUpdate = require('log-update');
const fs = require('fs');

const startTime = Date.now(); //record time at start
const log = logUpdate.create(process.stdout, {
    showCursor: true //enables re-writing the console
});
function isHex(h) {
    var a = parseInt(h.toLowerCase(), 16); //convert hex to base10, h must not start w/ "0"
    return ("0x" + a.toString(16).toLowerCase() === h.toLowerCase()); //convert back to hex, confirm same value
}
var prefix = true; //true: looking for a match at the start of an address, false: address contains a string
var addresses = []; //will save addresses for future reference
var addressesFile = ""; //optional input file
var invalidOptionsString = "Options invalid. See --help for valid usage examples."; //string we will display when input error
switch (process.argv[3]) {
    case "-c" || "-C" || "--contains" || "--Contains": //match addresses containing specified string
        prefix = false;
        break;
    case "--addresses" || "--Addresses" || "-a" || "-A": //specify an optional input file
        addressesFile = process.argv[4];
        addresses = JSON.parse(fs.readFileSync(addressesFile, 'utf8').toLowerCase());
        break;
    default:
        if (process.argv[3] != null) {
            console.log(invalidOptionsString); //all other input invalid
            process.exit();
        }
        break;
}
if (addressesFile == "") { //user hasn't specified input file yet
    if (process.argv[4] == "--addresses" || process.argv[4] == "--Addresses" || process.argv[4] == "-A" || process.argv[4] == "-a") {
        addressesFile = process.argv[5];
        addresses = JSON.parse(fs.readFileSync(addressesFile, 'utf8').toLowerCase());
    }
    else if (process.argv[4] == null) {
        //do nothing for no argument
    }
    else {
        console.log(invalidOptionsString);
        process.exit(); //all other input invalid
    }
} else {
    if (process.argv[5] == "-c" || process.argv[5] == "-C" || process.argv[5] == "--contains" || process.argv[5] == "--Contains") {
        prefix = false;
    }
}
//first argument [2]: "--help" || {the hex value to match}
var matchStartsWith0 = false;
if (process.argv[2] == "-h" || process.argv[2] == "--help") { // help message
    console.log(fs.readFileSync("helpText.txt", 'utf8'));
    process.exit();
}
else {
    var toMatch = process.argv[2].toLowerCase(); //{the hex value to match}
    if (toMatch.substring(0, 2) != "0x") { //check if user used "0x" prefix
        if (toMatch.substring(0, 1) == 0) { //check if match begins w/ 0
            matchStartsWith0 = true;
            toMatch = "" + 1 + toMatch; //add a 1 @ the start for chekcing if valid hex
        }
        toMatch = "0x" + toMatch; //new addresses have by default
    }
    else {
        prefix = true; //"0x" means the match is at the beginning
        if (toMatch.substring(2, 3) == 0) { //check if match begins w/ 0
            matchStartsWith0 = true;
            toMatch = "0x" + 1 + toMatch.substring(2, toMatch.length); //add a 1 @ the start for chekcing if valid hex
        }
    }
}
var addressesOnFile = JSON.parse(fs.readFileSync(addressesFile, 'utf8').toLowerCase()); //always load this file
addresses = addresses.concat(addressesOnFile); //add default file addresses
addresses = [new Set(addresses)]; //remove duplicates
//
if (!isHex(toMatch)) { //validate match string
    console.log("Invalid vanity address prefix: must be hexadecimal & length less than 7.");
    process.exit(1);
} else {
    if (matchStartsWith0) {
        toMatch = "0x" + toMatch.substring(3, toMatch.length); //take off the "1" we added for hex validation
    }
}
var lengthToMatch = toMatch.length;
//difficulty = (possible combinations) - (unique addresses in on file)
var difficulty = Math.pow(16, lengthToMatch - 2) - addresses.length;
if (prefix) {
    console.log("Searching for an address that starts with: " + toMatch);
    console.log("Difficulty: " + difficulty);
}
else {
    difficulty = difficulty / (40 / (lengthToMatch - 2)); //40 chars in an address, match can be anywhere
    toMatch = toMatch.substring(2, lengthToMatch); //cut off the "0x" we added
    console.log("Searching for an address that contains: " + toMatch);
    console.log("Difficulty: " + difficulty);
}
function SaveAndQuit() {
    console.log("Saving Addresses..."); //always save to default file, never the input file
    fs.writeFileSync("addresses.json", JSON.stringify(addresses, null, 2).toLowerCase());
    process.exit();
}

var elementPos; //
if (prefix) { //check if any addresses in the file match
    elementPos = addresses.findIndex(wallets => wallets.address.substring(0, lengthToMatch) == toMatch);
} else {
    elementPos = addresses.findIndex(wallets => wallets.address.includes(toMatch));
}
if (elementPos != -1) { //we found a match
        console.log("Found solution in addresses file:");
        console.log(addresses[elementPos].address);
        console.log(addresses[elementPos].phrase);
        SaveAndQuit();
}
else {
    console.log(`Solution not found in file: ${addresses.length} addresses`);
}

var displayExtra = ""; //display a temp message
var foundIt = false; //true if we generate a match
var tries = 0; //count of how many addresses gen
var lastCalcTime = startTime; //stores when the last rate calc occured
var lastCalcTries = 0;
var triesPerSecond = 0;
var timer = 0;
var percentChance = 0.5;
var remaining, remainingUnit;
var calcInterval = 5; //higher number increase performance
function getUnknownAddress() {
    const randomMnemonic = ethers.Wallet.createRandom().mnemonic;
    var wallet = ethers.Wallet.fromMnemonic(randomMnemonic.phrase);
    var walletAddress = wallet.address.toLowerCase();
    if (addresses.some(wallets => wallets.address == walletAddress)) {
        displayExtra += "Duplicate address found. Wow!\n";
        return getUnknownAddress();
    }
    return wallet;
}
function loop() {
    const wallet = getUnknownAddress();
    addresses.push({
        address: wallet.address.toLowerCase(),
        phrase: wallet.mnemonic.phrase
    });
    tries++;
    var now = Date.now();
    var timeSpent = ((now - startTime) / 1000);

    if (timeSpent > timer) {
        displayExtra = "";
        triesPerSecond = ((tries - lastCalcTries) / (timeSpent / lastCalcTime)) / calcInterval;
        function getRemaining() {
            var remainingTry = (((difficulty * percentChance) - tries) / triesPerSecond);
            if (remainingTry < 0) {
                percentChance += 0.1;
                if (percentChance < 1) {
                    return getRemaining();
                }
                else {
                    return 1.0;
                }
            }
            return remainingTry;
        }
        remaining = getRemaining();
        remainingUnit = " seconds";
        if (remaining > 60) {
            remaining = remaining / 60;
            remainingUnit = " minutes";
            if (remaining > 60) {
                remaining = remaining / 60;
                remainingUnit = " hours";
                if (remaining > 24) {
                    remaining = remaining / 24;
                    remainingUnit = " days";
                    if (remaining > 365) {
                        remaining = remaining / 365;
                        remainingUnit = " years";
                    }
                }
            }
        }

        //
        timer += 5;
        lastCalcTime = timeSpent;
        lastCalcTries = tries;
    }

    var timeUnit = " seconds";
    if (timeSpent > 60) {
        timeSpent = timeSpent / 60;
        timeUnit = " minutes";
        if (timeSpent > 60) {
            timeSpent = timeSpent / 60;
            timeUnit = " hours";
        }
    }
    timeSpent = Math.round(timeSpent);

    if (prefix) {
        if (wallet.address.substring(0, lengthToMatch).toLowerCase() == toMatch) {
            foundIt = true;
            log(`Success!\n${wallet.address}\n${wallet.mnemonic.phrase}`);
        }
    } else {
        if (wallet.address.toLowerCase().includes(toMatch)) {
            foundIt = true;
            log(`Success!\n${wallet.address}\n${wallet.mnemonic.phrase}`);
        }
    }
    if (foundIt == false) {
        log(`${displayExtra}\nChecked ${tries} addresses.\nTime: ${timeSpent + timeUnit}\nIterations / Second: ${Math.round(triesPerSecond)}\n${Math.round(100 * percentChance)}% chance in: ~${Math.round(remaining) + remainingUnit}`);
        setImmediate(loop);
    } else {
        SaveAndQuit();
    }
};
loop();

process.on('SIGINT', function () {
    SaveAndQuit();
});

// $ExpectType Promise<BluetoothDevice[]>
navigator.bluetooth.getDevices();

// $ExpectType Promise<boolean>
navigator.bluetooth.getAvailability();

// $ExpectType Promise<BluetoothDevice>
navigator.bluetooth.requestDevice({
    filters: [{
        services: ["heart_rate"],
        name: "some-name",
        namePrefix: "prefix",
        manufacturerData: [{
            companyIdentifier: 0x0858,
        }],
        serviceData: [{
            service: "heart_rate",
        }],
    }],
});
// $ExpectType Promise<BluetoothLEScan>
navigator.bluetooth.requestLEScan({ acceptAllAdvertisements: true });

navigator.bluetooth.addEventListener("advertisementreceived", event => {
    event; // $ExpectType BluetoothAdvertisingEvent
});

navigator.bluetooth.addEventListener("advertisementreceived", event => {
    event; // $ExpectType BluetoothAdvertisingEvent
}, { once: true, signal: AbortSignal.timeout(1000) });

BluetoothUUID.getService(0x180D); // $ExpectType string

BluetoothUUID.getCharacteristic(0x2A37); // $ExpectType string

BluetoothUUID.getDescriptor(0x2902); // $ExpectType string

BluetoothUUID.canonicalUUID("0x180D"); // $ExpectType string

// Example 1 (from the spec):
let chosenHeartRateService: BluetoothRemoteGATTService = null;

navigator.bluetooth.requestDevice({
    filters: [{
        services: ["heart_rate"],
    }],
}).then((device: BluetoothDevice) => device.gatt.connect())
    .then((server: BluetoothRemoteGATTServer) => server.getPrimaryService("heart_rate"))
    .then((service: BluetoothRemoteGATTService) => {
        chosenHeartRateService = service;
        return Promise.all([
            service.getCharacteristic("body_sensor_location")
                .then(handleBodySensorLocationCharacteristic),
            service.getCharacteristic("heart_rate_measurement")
                .then(handleHeartRateMeasurementCharacteristic),
        ]);
    });

function handleBodySensorLocationCharacteristic(characteristic: BluetoothRemoteGATTCharacteristic) {
    if (characteristic === null) {
        console.log("Unknown sensor location.");
        return Promise.resolve();
    }

    // not from the spec - exercising additional APIs
    const buffer = new Uint8Array(0);
    characteristic.writeValue(buffer);
    characteristic.writeValueWithResponse(buffer);
    characteristic.writeValueWithoutResponse(buffer);

    return characteristic.readValue()
        .then(sensorLocationData => {
            let sensorLocation = sensorLocationData.getUint8(0);
            switch (sensorLocation) {
                case 0:
                    return "Other";
                case 1:
                    return "Chest";
                case 2:
                    return "Wrist";
                case 3:
                    return "Finger";
                case 4:
                    return "Hand";
                case 5:
                    return "Ear Lobe";
                case 6:
                    return "Foot";
                default:
                    return "Unknown";
            }
        }).then(location => console.log(location));
}

function handleHeartRateMeasurementCharacteristic(characteristic: BluetoothRemoteGATTCharacteristic) {
    return characteristic.startNotifications()
        .then(char => {
            characteristic.addEventListener("characteristicvaluechanged", onHeartRateChanged);
            characteristic.addEventListener("characteristicvaluechanged", onHeartRateChanged, {
                once: true,
                signal: AbortSignal.timeout(1000),
            });
        });
}

function onHeartRateChanged(event: Event) {
    let characteristic = event.target as BluetoothRemoteGATTCharacteristic;
    console.log(parseHeartRate(characteristic.value));
}

function parseHeartRate(data: DataView) {
    let flags = data.getUint8(0);
    let rate16Bits = flags & 0x1;
    let result: any = {};
    let index = 1;
    if (rate16Bits) {
        result.heartRate = data.getUint16(index, /*littleEndian=*/ true);
        index += 2;
    } else {
        result.heartRate = data.getUint8(index);
        index += 1;
    }
    let contactDetected = flags & 0x2;
    let contactSensorPresent = flags & 0x4;
    if (contactSensorPresent) {
        result.contactDetected = !!contactDetected;
    }
    let energyPresent = flags & 0x8;
    if (energyPresent) {
        result.energyExpended = data.getUint16(index, /*littleEndian=*/ true);
        index += 2;
    }
    let rrIntervalPresent = flags & 0x10;
    if (rrIntervalPresent) {
        let rrIntervals: number[] = [];
        for (; index + 1 < data.byteLength; index += 2) {
            rrIntervals.push(data.getUint16(index, /*littleEndian=*/ true));
        }
        result.rrIntervals = rrIntervals;
    }
    return result;
}

// Example from the scanning spec
navigator.bluetooth.requestLEScan({
    acceptAllAdvertisements: true,
}).then((scan: BluetoothLEScan) => {
    console.log("Scan started with:");
    console.log(" acceptAllAdvertisements: " + scan.acceptAllAdvertisements);
    console.log(" active: " + scan.active);
    console.log(" keepRepeatedDevices: " + scan.keepRepeatedDevices);
    console.log(" filters: " + JSON.stringify(scan.filters));

    navigator.bluetooth.addEventListener("advertisementreceived", (event: BluetoothAdvertisingEvent) => {
        console.log("Advertisement received.");
        console.log("  Advertisement name: " + event.name);
        console.log("  Advertisement UUIDs: " + event.uuids);
        console.log("  Advertisement appearance: " + event.appearance);
        console.log("  Advertisement RSSI: " + event.rssi);
        console.log("  Advertisement TX Power: " + event.txPower);
        console.log("  Device Name: " + event.device.name);
        console.log("  Device ID: " + event.device.id);

        event.manufacturerData.forEach((valueDataView, key) => {
            logDataView("Manufacturer", key, valueDataView);
        });
        event.serviceData.forEach((valueDataView, key) => {
            logDataView("Service", key, valueDataView);
        });
    });

    setTimeout(stopScan, 10000);
    function stopScan() {
        console.log("Stopping scan...");
        scan.stop();
        console.log("Stopped.  scan.active = " + scan.active);
    }
});

/* Utils */
const logDataView = (labelOfDataSource: string, key: string | number, valueDataView: DataView) => {
    const array = new Uint8Array(valueDataView.buffer);
    const hexString = Array(array.length).map((_, index) => {
        return `0${array[index].toString(16)}`.slice(-2);
    }).join(" ");
    const textDecoder = new TextDecoder("ascii");
    const asciiString = textDecoder.decode(valueDataView.buffer);
    console.log(`  ${labelOfDataSource} Data: ${key}
        (Hex): ${hexString}
        (ASCII): ${asciiString}
    `);
};

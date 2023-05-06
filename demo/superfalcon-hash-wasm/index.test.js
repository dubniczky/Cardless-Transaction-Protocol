const hashTypes = [
    'sha512', 'sha-512', 'sha2-512', 'sha3512', 'sha3-512'
]

const superFalcon = require('.')

const message = new Uint8Array([98, 97, 108, 108, 115, 0]);

const toHex = bytes => Buffer.from(bytes).toString('hex');

test('key pair generation', async () => superFalcon.keyPair());

for (const hashType of hashTypes) {
	test(`end-to-end test of ${hashType}`, async () => {
		const keyPair = await superFalcon.keyPair();

		const signed = await superFalcon.sign(
            hashType,
			message,
			keyPair.privateKey
		);
		const verified = await superFalcon.open(
            hashType,
			signed,
			keyPair.publicKey
		);

		const signature = await superFalcon.signDetached(
            hashType,
			message,
			keyPair.privateKey
		);
		const isValid = await superFalcon.verifyDetached(
            hashType,
			signature,
			message,
			keyPair.publicKey
		);

		expect(toHex(verified)).toBe(toHex(message));
		expect(isValid).toBe(true);
	});
}

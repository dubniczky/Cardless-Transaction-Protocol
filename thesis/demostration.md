# Demonstration

## Implementation details

### Technologies used

We created a set of applications to demonstrate the token negotiation, remediation and revision procedures. The demonstration consists of four packages, which together create:

- A Vendor application
- A Provider/Bank application
- And an automated test for these

Our intention was to make these applications as simple as possible, and the tech stack which we chose mirrors that well. Both the Vendor and the Provider application consist of a back-end and a front-end part. For back-end we use NodeJS with the express library to create a REST API. For the front-end we decided in favor of using the basic HTML and vanilla Javascript combination to keep the implementation simple. In some places the rendering of dynamic content was necessary. For this purpose we chose the EJS templating language. We chose pnpm as the package manager for NodeJS, a more performant variant of the classic npm. Finally for our automated end-to-end test we sticked with the Selenium Webdriver instantiated with the Google Chrome browser.

### Cryptography implementations used

In our demonstration we used several cryptography algorithms to ensure the security of the protocol. This section discusses in detail which implementations are used where.

Where it was possible we sticked with NodeJS's crypto library. This library is used to generate any cryptographically secure random data, like the UUIDs in the token negotiation and the challenges in the token remediation and revison. Furthermore, this default implementation is used for symmetric AES encryption and SHA512 hasing.

A key component of the STP is the digital signatures. As discussed before we chose Falcon1024 as the post-quantum digital signature scheme. However post-quantum digital signature schemes are suggested to be combined with well established pre-quantum schemes, since the new standardization process is still in progress. Unfortunately, NodeJS does not provide a built-in implemenation for post-quantum schemes yet, for this reason it was necessary to look for alternatives. In search of an adequite implementation we created the following criteria:

- The implementaion needed to be relatively fast. WebAssembly implementations were prefered over vanilla Javascript ones
- It had to be easily integratable with our demonstration. For this reason many other programming languages were excluded

Finally we decided to go with [superfalcon](https://www.npmjs.com/package/superfalcon), which conveniently combines an Emscriptem WebAssembly wrapper for the C implementation of Falcon and another Emscriptem WebAssembly wrapper for libsodium's Ed25519 implementation. It also provides a fast SHA512 implementation, which uses a native implementation ivf available. These combined seemed a good fit for our usecase.

Unfortunately, superfalcon does not support other hashing algorithms, like SHA3-512. In the future we may extend our implementation by a fork of superfalcon supporting SHA3 too. To substitute the fast SHA512 implementation with Keccak variants the [hash-wasm](https://www.npmjs.com/package/hash-wasm) library can be used, which support all popular hashing schemes written in WebAssembly.

### The structure of the demonstration

The demonstration contains 5 subfolders:

- The `common` folder contains utilities used by at least two of the Vendor app, the Provider app and the automated tests. In the `falcon.js` it contains a wrapper for digital signatures, while `keygen.js` is for generating new digital signature keys. All other utilities can be accesed by importing th `utils.js` file from here.
- The `keys` folder is where the cryptographic keys of the vendor and provider are stored as `.pem` files in one place. Of course in a real world use case keys would not be stores in such a manner. We chose this approach for organization reasons only, keeping in mind that it is just a demostration.
- The `provider` folder is where the provider/bank demo application is implemented. The entry point of the back-end is the `server.js` file. To keep the implemantation clean the functionalities were separated to different Javascript files, like `protocol.js` for the implementation of the protocol, `validator.js` for request validation, and a common `protocolState.js` to make the internal state of the protocol easly accessible. At the same time the `public` folder contains the front-end's entry as `index.html`, and the `views` folder contain the EJS templates.
- The `test` folder contains the automated end-to-end tests. These test are implemented in the `test.js` file, while the `testenv.js` file provides functionality to rebuild the test environment before each testcase. Finally the `browser.js` hides all selenium related impolementations
- Finally the `vendor` folder contains the vendor demo application's implementation. In structure it is almost identical to the provider application

### Details about the Token negotiation

At first on the vendor's side we created a form to set the details of the transaction to be negotiated, so we could easly demonstrate different use cases. After setting the amount, currency, and recurrance we generate an STP URL. In a production scenario the transaction details would be fixed by the vendor, and the customer would be presented with the STP URL encoded as a QR code right at the beginning.

In the demonstration the STP URL is simply copied to the provider's application. Again, in a real worls use case the QR code would be scanned by the bank's mobile application.

After entering the URL the customer need to type the verification PIN, which is generated by the provider and presented in the vendor's app. STP support a more wide range of PIN's, but here we decided to use a classic 4 digit variant. The provider can decide on the manner of entering the PIN code: they can present the customer with a numeric input, or multiple choices, or some other method. In the demosntration we use a simple numeric input.

### Details about the Token remediation and revision

On all ocasions, but the pending modification, the remediation and revision happens without customer interaction. In the demonstration these procedures can be initiated manually.

Both the remediation and revision happen in a single HTTPS request-response round trip. These are implemented in the `remediateToken` and `reviseToken` functions at the vendor's and provider's side respectively.

### Testing

We believe in the importance of testing as the main method of assuring the quality of a given software. For this reason we included tests in our demostration, despite not having such rigorous quality requirements due to the demostrational nature of our implementation. The main purpose of these test were to provide us with a quick way to verify the implementation of new functionalities, while checking whether we caused any regression issues. We deemed end-to-end tests to be the best fitting candidate to fulfill this purpose.

As mentioned before, we used Selenium Webdriver to power these end-to-end tests. [Selenium](https://www.selenium.dev/about/) provides a suite of tools for automating web browsers. Its API is available in a multitude of popular programming languages such as Java, Python, Javascript etc. Furthermore, the framework supports all of the major browsers on the market such as Chrome/Chromium, Firefox, Internet Explorer, Edge, and Safari. For this reason Selenium is still a widely used framework for all browser automation related tasks, including but not limited to end-to-end testing. 

Another library we used is Mocha, which makes it easier to execute automated tests in a reliable manner, while generating reports of these executions. It is also widely used in the industry, and comes with many more functionalities. It is fair to say, that we just sratched the surface of this library, but we did not want to complicate our tests any more than it was necessary.

Our end-to-end tests consist of test groups, each of which contains test cases. The structure of the test we implemented is the following:

- Token negotiation
    - Non-recurring token
    - Recurring token
- Token revocation
    - Revocation by vendor
    - Revocation by provider
- Token refreshing
    - Single refresh
- Token modification
    - Instant accept
    - Delayed accept

This way all of the the token negotiation, remediation and revision procedures are covered by testcases to ensure the quality of the demonstrations we created.

## Benchmarks

TODO

## Potential improvements

TODO

### Bulk/batch remediation and revision

TODO

### Superfalcon supporting SHA3

TODO
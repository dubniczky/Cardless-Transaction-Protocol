# Demonstration

*Work in progress...*

## Implementation details

### Technologies used

We created a set of applications to demonstrate the token negotiation, remediation and revision procedures. The demonstration consists of four packages, which together create:

- A Vendor application
- A Provider/Bank application
- And an automated test for these

Our intention was to make these applications as simple as possible, and the tech stack which we chose mirrors that well. Both the Vendor and the Provider application consist of a back-end and a front-end part. For back-end we use NodeJS with the express library to create a REST API. For the front-end we decided in favor of using the basic HTML and vanilla Javascript combination to keep the implementation simple. In some places the rendering of dynamic content was necessary. For this purpose we chose the EJS templating language. Finally for our automated end-to-end test we sticked with the Selenium Webdriver instantiated with the Google Chrome browser.

### The structure of the demonstration

The demonstration contains 5 subfolders:

- The `common` folder contains utilities used by at least two of the Vendor app, the Provider app and the automated tests. All of the utilities can be accesed by importing th `utils.js` file from here.
- The `keys` folder is where the cryptographic keys of the vendor and provider are stored as `.pem` files in one place. Of course in a real world use case keys would not be stores in such a manner. We chose this approach for organization reasons only, keeping in mind that it is just a demostration.
- The `provider` folder is where the provider/bank demo application is implemented. The entry point of the back-end is the `server.js` file. To keep the implemantation clean the functionalities were separated to different Javascript files, like `protocol.js` for the implementation of the protocol, `validator.js` for request validation, and a common `protocolState.js` to make the internal state of the protocol easly accessible. At the same time the `public` folder contains the front-end's entry as `index.html`, and the `views` folder contain the EJS templates.
- The `test` folder contains the automated end-to-end tests. These test are implemented in the `test.js` file, while the `testenv.js` file provides functionality to rebuild the test environment before each testcase. Finally the `browser.js` hides all selenium related impolementations
- Finally the `vendor` folder contains the vendor demo application's implementation. In structure it is almost identical to the provider application

### The protocol implementation

TODO

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

## User manual

TODO

## Benchmarks

TODO

## Potential improvements

TODO

### Bulk/batch remediation and revision

TODO
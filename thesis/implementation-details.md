# Implementation details

*Work in progress...*

## Technologies used

We created a set of applications to demonstrate the token negotiation, remediation and revision procedures. The demonstration consists of four packages, which together create:

- A Vendor application
- A Provider/Bank application
- And an automatet test for these

Our intention was to make these applications as simple as possible, and the tech stack which we chose mirrors that well. Both the Vendor and the Provider application consist of a back-end and a front-end part. For back-end we use NodeJS with the express library to create a REST API. For the front-end we decided in favor of using the basic HTML and vanilla Javascript combination to keep the implementation simple. In some places the rendering of dynamic content was necessary. For this purpose we chose the EJS templating language. Finally for our automated end-to-end test we sticked with the Selenium Webdriver instantiated with the Google Chrome browser.

## The structure of the demonstration

TODO

## Usage of the demo applications

TODO

## Testing

TODO

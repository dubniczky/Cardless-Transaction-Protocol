# Signed Transaction Protocol (STP)

_v4_

## Token negotiation

The protocol replaces the credit/debit card details with a JWT. The token authorizes the vendor to:

- Make a given transaction once until the token expires
- If the transaction is recurring, then to refresh (get the next) token 

The token negotiation consists of 5 steps:

1. **VendorQR**

    The vendor generates a QR code of signed a URL

1. **ProviderHello**

    The provider (bank) connects to the vendor on the previously given signed URL using `https`, and verifies its identity by signing the ID in the url with its private key

1. **VendorToken**

    The vendor verifies the provider's identity, then responds with transaction details, another signed URL and the JWT signed by them

1. **ProviderToken**

    The provider waits until the user provides the verification PIN and accepts the transaction, then signes the JWT and sends it to the vendor

1. **VendorAck**

    The vendor acknowledges the JWT and checks its validity

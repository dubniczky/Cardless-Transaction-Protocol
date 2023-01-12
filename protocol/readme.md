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

## Token change by vendor

The vendor can modify, revoke, refresh a given token later after a mutual authentication with the provider


1. **VendorChall**

    First the vendor sends the transaction ID and a challenge to the provider

1. **ProviderVerifChall**

    The provider responds with the challenge signed and another challenge to the vendor

1. **VendorVerifChange**

    The vendor send the challenge signed and the change intent with any additional necessary data 

1. **ProviderAck**

    The provider acknowledges the change, and sends back the new token (except if the token is revoked)

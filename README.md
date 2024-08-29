# LI.FI custom tokens

LI.FI supports any token passed to the API as long as we can validate it and find a USD price for it.

The API exposes a list of tokens that UIs can use as default to give their users tokens to choose from. e.g. our widget uses that list: https://li.quest/v1/tokens

We automatically include tokens in that token list if they are listed in one of the token lists we support:
- lists of assets the bridges support
- official lists of exchanges we support
- our own custom token list (this repository)

And if we can validate the token:
- we can find USD prices via Debank or Zerion APIs
- the token is not a spam/fee-taking token

You can also add scam tokens to /denyTokens/network.json and we will block this token in our system.

## How to add your token

To add your token find the file representing the chain your token is in in the **tokens** folder.

Add your token as the last element in the list (don't forget the `,` after the previous token):

```json
  },  <== Add the comma
  {
    "address": "0x155f0DD04424939368972f4e1838687d6a831151",
    "chainId": 42161,
    "logoURI": "https://yoursite.com/token.svg", <= permanent link to an image of your token
    "decimals": 18,
    "name": "Nice Name",
    "symbol": "SYMBOL"
  }
]

```

## How to block a token

To add a scam token find the file representing the chain the token is in in the **denyTokens** folder. 

Add the token as the last element in the list (don't forget the `,` after the previous token):

```json
  },  <== Add the comma
  {
    "address": "0xde3a24028580884448a5397872046a019649b084",
    "chainId": 43114,
    "reason": "Deprecated USDT token on AVA", <= add an optional reason why the token should be blocked
  }
]
```

Create a PR with the change describing why we should add that token. Link your project, CoinGecko and profiles so we can validate the token.

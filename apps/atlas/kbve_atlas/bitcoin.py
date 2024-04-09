import requests

url = "https://api.coindesk.com/v1/bpi/currentprice.json"

response = requests.request("GET", url)

price = response.json()["bpi"]["USD"]["rate"]

print(f"The current USD price for Bitcoin is: ${price}")

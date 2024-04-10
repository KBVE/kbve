import requests
from datetime import datetime

def get_current_year():
    return datetime.now().year

url = "https://api.chucknorris.io/jokes/random"

response = requests.get(url)
data = response.json()

#print(data['value'])


name = input(("Hello, What is your name?"))
print(f"Hello, {name}, I am Joel. Nice to meet you. Here is a funny joke for you: {data['value']}")
currentyear = get_current_year()
birthyear= input("What year were you born")
age = (int(currentyear) - int(birthyear))
print(f"You're {age} years old")
pounds = input("How much wood could a Woodchuck, chuck; if a WoodChuck could chuck wood?")

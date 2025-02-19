extends Node

## Signals
signal resource_changed(resource_name, new_value)
signal resource_receipt(resource_name, amount, new_value, invoice)

var resources := {
    "gold": 0,
    "stone": 0,
    "metal": 0,
    "gems": 0
}


func earn_resource(resource_name: String, amount: int, invoice: String = "Earned"):
    if amount <= 0:
        return 

    if not resources.has(resource_name):
        resources[resource_name] = 0

    resources[resource_name] += amount
    emit_signal("resource_receipt", resource_name, amount, resources[resource_name], invoice)
    emit_signal("resource_changed", resource_name, resources[resource_name])


func spend_resource(resource_name: String, cost: int, invoice: String = "Purchase") -> bool:
    if cost <= 0:
        return false

    if not resources.has(resource_name):
        return false

    if resources[resource_name] >= cost:
        resources[resource_name] -= cost
        emit_signal("resource_receipt", resource_name, -cost, resources[resource_name], invoice)
        emit_signal("resource_changed", resource_name, resources[resource_name])
        return true
    else:
        return false

func get_resource(resource_name: String) -> int:
    return resources.get(resource_name, 0)

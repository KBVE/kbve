#include "BootlegGossipUtil.h"

#include "Item.h"
#include "Player.h"
#include "ScriptedGossip.h"
#include "SharedDefines.h"
#include "StringFormat.h"

namespace
{
// FFD100 matches the client's money-text gold; dimmer values wash out on the
// parchment background. Red stays desaturated so it doesn't overpower labels.
char const* BOOTLEG_MONEY_COLOR_AFFORDABLE = "FFD100";
char const* BOOTLEG_MONEY_COLOR_UNAFFORDABLE = "CC3333";

char const* BOOTLEG_GOLD_ICON = "Interface\\MoneyFrame\\UI-GoldIcon";
char const* BOOTLEG_SILVER_ICON = "Interface\\MoneyFrame\\UI-SilverIcon";
char const* BOOTLEG_COPPER_ICON = "Interface\\MoneyFrame\\UI-CopperIcon";

// 0 = scale the coin to the text height; fixed sizes render smaller than the
// digits at default UI scale.
uint32 constexpr BOOTLEG_COIN_ICON_HEIGHT = 0;

std::string FormatCoinPart(uint32 amount, char const* colorHex, char const* iconPath)
{
    return Acore::StringFormat("|cff{}{}|r |T{}:{}|t", colorHex, amount, iconPath, BOOTLEG_COIN_ICON_HEIGHT);
}

std::string BootlegFormatMoneySuffix(uint32 costCopper, bool canAfford)
{
    char const* color = canAfford ? BOOTLEG_MONEY_COLOR_AFFORDABLE : BOOTLEG_MONEY_COLOR_UNAFFORDABLE;

    uint32 const gold = costCopper / GOLD;
    uint32 const silver = (costCopper % GOLD) / SILVER;
    uint32 const copper = costCopper % SILVER;

    std::string result = " ";
    bool first = true;

    // Denomination groups are concatenated without separators, matching the
    // native MoneyFrame layout (e.g. "9[icon]50[icon]").
    auto append = [&](uint32 amount, char const* iconPath)
    {
        if (amount == 0)
        {
            return;
        }

        result += FormatCoinPart(amount, color, iconPath);
        first = false;
    };

    append(gold, BOOTLEG_GOLD_ICON);
    append(silver, BOOTLEG_SILVER_ICON);
    append(copper, BOOTLEG_COPPER_ICON);

    if (first)
    {
        result += FormatCoinPart(0, color, BOOTLEG_COPPER_ICON);
    }

    return result;
}
} // namespace

void BootlegNotifyInsufficientMoney(Player* player)
{
    if (player)
    {
        player->SendBuyError(BUY_ERR_NOT_ENOUGHT_MONEY, 0, 0, 0);
    }
}

void BootlegAddPaidGossipItem(Player* player, uint8 icon, std::string const& label,
                              uint32 action, uint32 costCopper, char const* popupText)
{
    if (!player)
    {
        return;
    }

    bool const canAfford = player->HasEnoughMoney(costCopper);
    std::string const displayLabel = label + BootlegFormatMoneySuffix(costCopper, canAfford);

    if (canAfford)
    {
        AddGossipItemFor(player, icon, displayLabel, GOSSIP_SENDER_MAIN, action, popupText, costCopper, false);
    }
    else
    {
        AddGossipItemFor(player, icon, displayLabel, GOSSIP_SENDER_MAIN, action);
    }
}

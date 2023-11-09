using UnityEngine;

public class PlayerHealth : MonoBehaviour
{
    // You can call this method to damage the player by a certain amount
    public void DamagePlayer(int damageAmount)
    {
        Player.Instance.TakeDamage(damageAmount);
    }

    public void HealPlayer(int healAmount)
    {
        Player.Instance.Heal(healAmount);
    }

}

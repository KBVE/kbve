using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class Tower : TowerBase
{
    [Header("Line References")]
    [SerializeField] Transform[] _cosmicLines;

    [Space(3)]

    [Header("Line Settings")]
    [SerializeField] float _startWidth;
    [SerializeField] float _endWidth;
    [SerializeField] Color _startColor;
    [SerializeField] Color _endColor;
    [SerializeField] Material _material;

    [Header("Combat Settings")]
    [SerializeField] Transform _attackPoint;
    [SerializeField] GameObject _arrowPrefab;
    [SerializeField] float _arrowSpeed = 15f;
    [SerializeField] float _attackCooldown = 2f;
    [SerializeField] float _rotationTime = 4f;

    private PlayerData playerData;
    private Transform _player;

    private void Awake()
    {
        this.attackPoint = _attackPoint;
        this.arrowSpeed = _arrowSpeed;
        this.arrowPrefab = _arrowPrefab;
        this.attackCooldown = _attackCooldown;
        this.player = _player;

        this.InitializeCosmicLines(_cosmicLines, _startWidth, _endWidth, _startColor, _endColor, _material);

        playerData = new PlayerData();
        this.player = GameObject.FindWithTag("Player").GetComponent<Transform>();
    }

    private void Update()
    {
        PositionManager.SetPositions(player, playerData);

        Vector3 smoothRotation = Vector3.Lerp(transform.position, this.player.position, _rotationTime * Time.deltaTime);
        transform.LookAt(smoothRotation);
        Shoot();
    }
}

public abstract class TowerBase : MonoBehaviour
{
    private bool canAttack = true;
    public float attackCooldown;

    public GameObject arrowPrefab;
    public Transform attackPoint;
    public float arrowSpeed;
    public Transform player;

    public void Shoot()
    {
        if (!canAttack)
        {
            Debug.Log("Can't attack now on Cooldown!");
            return;
        }

        Vector3 direction = player.position - transform.position;

        GameObject createdArrow = Instantiate(arrowPrefab, attackPoint.position, Quaternion.identity);
        Rigidbody rb = createdArrow.gameObject.AddComponent<Rigidbody>();

        rb.useGravity = false;
        rb.freezeRotation = true;
        rb.velocity = direction * arrowSpeed;

        StartCoroutine(Cooldown(attackCooldown));
    }

    public IEnumerator Cooldown(float cooldown)
    {
        canAttack = false;
        yield return new WaitForSeconds(cooldown);
        canAttack = true;
    }

    public void InitializeCosmicLines(Transform[] cosmicLines, float startWidth, float endWidth, Color startColor, Color endColor, Material material)
    {
        for (int i = 0; i < cosmicLines.Length; i++)
        {
            LineRenderer lineRenderer = cosmicLines[i].gameObject.AddComponent<LineRenderer>();

            lineRenderer.SetPosition(0, cosmicLines[i].position);
            lineRenderer.SetPosition(1, transform.position);

            lineRenderer.startWidth = startWidth;
            lineRenderer.endWidth = endWidth;

            lineRenderer.endColor = endColor;
            lineRenderer.startColor = startColor;

            lineRenderer.material = material;
        }
    }
}

static class PositionManager
{
    static Vector3 lastPosition;

    public static void SetPositions(Transform player, PlayerData playerData)
    {
        SetPlayerPositionData(player, playerData);
        SetLastPosition(playerData);
    }

    private static void SetPlayerPositionData(Transform player, PlayerData playerData)
    {
        playerData.position[0] = player.position.x;
        playerData.position[1] = player.position.y;
        playerData.position[2] = player.position.z;
    }

    private static void SetLastPosition(PlayerData playerData)
    {
        lastPosition.x = playerData.position[0];
        lastPosition.y = playerData.position[1];
        lastPosition.z = playerData.position[2];
    }

    public static Vector3 GetLastPosition()
    {
        return lastPosition;
    }
}

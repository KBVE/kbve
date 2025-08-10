using MoreMountains.Tools;
using MoreMountains.TopDownEngine;
using UnityEngine;

public class AIDecisionShouldDash : AIDecision
{
    [field: SerializeField] public float ObstacleCheckDistance { get; set; }
    [field: SerializeField] public float TargetCheckDistance { get; set; }
    [field: SerializeField] public LayerMask DashCheckLayerMask { get; set; }
    [field: SerializeField] public bool OnlyAllowValidDash { get; set; }
    [SerializeField] private bool _debug;
    [SerializeField] private AIActionDash _actionDash;
    [SerializeField] private CharacterDash2D _characterDash2D;

    public override void Initialization()
    {
        base.Initialization();
        _characterDash2D = this.gameObject.GetComponentInParent<CharacterDash2D>();
        _actionDash = this.gameObject.GetComponentInParent<AIActionDash>();
    }

    public override bool Decide()
    {
        Vector3 usToTarget = Vector3.zero;

        switch (_actionDash.Mode)
        {
            case AIActionDash.Modes.TowardsTarget:
                usToTarget = _brain.Target.transform.position - this.transform.position;
                break;
            case AIActionDash.Modes.AwayFromTarget:
                usToTarget = this.transform.position - _brain.Target.transform.position;
                break;
        }

        // TODO: Find a cleaner way than these eye-sore else-ifs
        if (!IsTargetTooClose())
            return false;
        else if (!OnlyAllowValidDash)
            return true;
        else if (!IsThereObstacleBehindUs())
            return true;
        else return false;
    }

    private bool IsThereObstacleBehindUs()
    {
        return !Physics2D.Raycast(this.transform.position,
                (_brain.Target.transform.position - this.transform.position).normalized,
                ObstacleCheckDistance,
                DashCheckLayerMask);
    }

    private bool IsTargetTooClose()
    {
        return (_brain.Target.transform.position - this.transform.position).magnitude < TargetCheckDistance;
    }

    public void OnDrawGizmos()
    {
        if (!_debug || _brain.Target == null) return;

        var hit = Physics2D.Raycast(this.transform.position, (this.transform.position - _brain.Target.transform.position).normalized, ObstacleCheckDistance, DashCheckLayerMask);

        Gizmos.color = hit ? Color.red : Color.green; 

        Gizmos.DrawSphere(hit ? hit.point : this.transform.position, 0.25f);
        Gizmos.DrawLine(this.transform.position, this.transform.position + (this.transform.position - _brain.Target.transform.position).normalized * ObstacleCheckDistance);
    }
}

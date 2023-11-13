using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class PlayerFX : MonoBehaviour
{
  private AudioSource _dragonSource;
  [SerializeField] AudioClip[] _wingFlap;
  [SerializeField] AudioClip[] _dragonland;
    // Start is called before the first frame update
    void Awake()
    {
        _dragonSource = GetComponent<AudioSource>();
    }

    // Update is called once per frame
    void Update()
    {
        
    }

  public void WingFlap()
  {
    _dragonSource.PlayOneShot(_wingFlap[Random.Range(0, _wingFlap.Length)]);
  }


  public void DragonLand()
  {
    _dragonSource.PlayOneShot(_dragonland[Random.Range(0, _dragonland.Length)]);
  }
}

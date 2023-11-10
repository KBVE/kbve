using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class DragonAnimSounds : MonoBehaviour
{
  private AudioSource dragonSource;
  [SerializeField] AudioClip[] jump;
  [SerializeField] AudioClip[] wingFlap;
  [SerializeField] AudioClip[] land;
  [SerializeField] AudioClip[] footStepsGrass;
  [SerializeField] AudioClip[] footStepsStone;
  [SerializeField] AudioClip[] footStepsDirt;
  [SerializeField] AudioClip[] footStepsFolliage;
  // Start is called before the first frame update
  void Start()
  {
    dragonSource = GetComponent<AudioSource>();
  }


  public void PlayFootStep()
  {

  }

  public void FootStepSwitch()
  {

  }


  public void Jump()
  {
    dragonSource.PlayOneShot(jump[Random.Range(0,jump.Length)]);
  }

  public void WingFlap()

  {
    dragonSource.PlayOneShot(wingFlap[Random.Range(0, wingFlap.Length)]);
  }




}    



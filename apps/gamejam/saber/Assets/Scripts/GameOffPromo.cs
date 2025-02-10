// Import the necessary Unity namespaces
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections;

// Define the GameOffPromo class, inheriting MonoBehaviour and implementing IPointerEnterHandler and IPointerExitHandler interfaces
public class GameOffPromo : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler
{
    // Public variables for configuring the script in the inspector
    public Sprite spriteToLoad;  // The sprite to be loaded and displayed
    public string urlToOpen = "https://kbve.com/discord/";  // The URL to open when the sprite is clicked
    public float margin = 10f;  // The margin from the top of the canvas
    public float defaultAlpha = 0.3f;  // The default alpha value of the sprite
    public float hoverScaleFactor = 1.2f;  // The scale factor for the sprite when hovered over
    public float scalingSpeed = 5f;  // The speed at which the sprite scales up or down
    public float volumeRiseSpeed = 1f;  // The speed at which the volume of the sound increases

    // Private variables for internal use
    private Image imageComponent;  // Reference to the Image component displaying the sprite
    private RectTransform rectTransform;  // Reference to the RectTransform component for positioning and scaling the sprite
    private Vector2 originalSize;  // The original size of the sprite
    private Vector2 targetSize;  // The target size of the sprite (used for scaling)
    private AudioSource audioSource;  // Reference to the AudioSource component for playing the hover sound
    private AudioClip hoverSound;  // The sound to be played when hovered over
    private Coroutine volumeCoroutine;  // Reference to the coroutine for rising the volume

    // The Start method is called once at the beginning of the runtime
    void Start()
    {
        // Attempt to load the sprite and sound from the Resources folder
        Sprite loadedSprite = Resources.Load<Sprite>("GameOff/2023");
        hoverSound = Resources.Load<AudioClip>("GameOff/sound");
        // Update spriteToLoad if a sprite was successfully loaded
        if (loadedSprite != null) spriteToLoad = loadedSprite;
        // Create a new GameObject to hold the Image component
        GameObject spriteObject = new GameObject("LoadedSprite");
        // Set the new GameObject as a child of the Canvas
        spriteObject.transform.SetParent(FindObjectOfType<Canvas>().transform, false);
        // Add the Image component to the GameObject and configure it
        imageComponent = spriteObject.AddComponent<Image>();
        imageComponent.sprite = spriteToLoad;
        imageComponent.preserveAspect = true;
        imageComponent.color = new Color(1, 1, 1, defaultAlpha);
        // Get the RectTransform component for positioning and scaling
        rectTransform = imageComponent.GetComponent<RectTransform>();
        // Set the size of the RectTransform to match the sprite's dimensions
        rectTransform.sizeDelta = new Vector2(spriteToLoad.rect.width, spriteToLoad.rect.height);
        // Store the original size of the RectTransform
        originalSize = rectTransform.sizeDelta;
        // Set the target size to the original size (initially)
        targetSize = originalSize;
        // Configure the RectTransform anchors, pivot, and position
        rectTransform.anchorMin = new Vector2(0.5f, 1);
        rectTransform.anchorMax = new Vector2(0.5f, 1);
        rectTransform.pivot = new Vector2(0.5f, 1);
        rectTransform.anchoredPosition = new Vector2(0, -margin - spriteToLoad.rect.height / 2);
        // Add a Button component for handling clicks
        Button buttonComponent = spriteObject.AddComponent<Button>();
        buttonComponent.onClick.AddListener(() => { OpenUrl(); });
        // Add an EventTrigger component for handling pointer enter/exit events
        EventTrigger eventTrigger = spriteObject.AddComponent<EventTrigger>();
        EventTrigger.Entry pointerEnterEntry = new EventTrigger.Entry();
        pointerEnterEntry.eventID = EventTriggerType.PointerEnter;
        pointerEnterEntry.callback.AddListener((eventData) => { OnPointerEnter(null); });
        eventTrigger.triggers.Add(pointerEnterEntry);
        EventTrigger.Entry pointerExitEntry = new EventTrigger.Entry();
        pointerExitEntry.eventID = EventTriggerType.PointerExit;
        pointerExitEntry.callback.AddListener((eventData) => { OnPointerExit(null); });
        eventTrigger.triggers.Add(pointerExitEntry);
        // Add an AudioSource component for playing the hover sound
        audioSource = spriteObject.AddComponent<AudioSource>();
        audioSource.clip = hoverSound;
        audioSource.playOnAwake = false;
        audioSource.volume = 0f;  // Start with a volume of 0
    }

    // The Update method is called once per frame
    void Update()
    {
        // Smoothly interpolate the size of the RectTransform towards the target size
        rectTransform.sizeDelta = Vector2.Lerp(rectTransform.sizeDelta, targetSize, Time.deltaTime * scalingSpeed);
    }

    // Method for opening the specified URL
    void OpenUrl()
    {
        Application.OpenURL(urlToOpen);
    }

    // Method for handling the pointer enter event (hover start)
    public void OnPointerEnter(PointerEventData eventData)
    {
        // Set the color alpha to 1 (fully opaque)
        imageComponent.color = Color.white;
        // Set the target size to the enlarged size
        targetSize = originalSize * hoverScaleFactor;
        // Play the hover sound
        audioSource.Play();
        // Stop any ongoing volume coroutine (if any)
        if (volumeCoroutine != null) StopCoroutine(volumeCoroutine);
        // Start a new coroutine to rise the volume
        volumeCoroutine = StartCoroutine(RiseVolume());
    }

    // Method for handling the pointer exit event (hover end)
    public void OnPointerExit(PointerEventData eventData)
    {
      // Null check for imageComponent
      if (imageComponent != null)
      {
          // Reset the color alpha to the default alpha
          imageComponent.color = new Color(1, 1, 1, defaultAlpha);
      }

      // Reset the target size to the original size
      targetSize = originalSize;

      // Null check for volumeCoroutine
      if (volumeCoroutine != null)
      {
          StopCoroutine(volumeCoroutine);
      }

      // Null check for audioSource
      if (audioSource != null)
      {
          // Reset the volume to 0
          audioSource.volume = 0f;
      }
    }

    // Coroutine for gradually increasing the volume of the hover sound
    private IEnumerator RiseVolume()
    {
        // Loop until the volume reaches 1 (or the coroutine is stopped)
        while (audioSource.volume < 1f)
        {
            // Increase the volume gradually over time
            audioSource.volume += Time.deltaTime * volumeRiseSpeed;
            // Yield control to the next frame
            yield return null;
        }
    }
}

import os
from google import genai
from google.genai import types
from PIL import Image

# Initialize the client
client = genai.Client()

# Open the image image
image_path = "Decko - CRM Dashboard.jfif"
try:
    img = Image.open(image_path)
    
    # Analyze the image to extract design tokens
    prompt = """
    You are an expert Design Systems Lead. Analyze this dashboard screenshot and extract the Design System.
    Focus on creating a specific, actionable design specification that an AI could use to recreate this exact aesthetic.

    Please provide your analysis in the following format:
    
    ## 1. Visual Theme & Atmosphere
    Describe the mood, density, variance, and motion intensity. Use evocative adjectives. (e.g., "A restrained, gallery-airy interface with confident asymmetric layouts. The atmosphere is clinical yet warm.")

    ## 2. Color Palette & Roles
    Extract the key colors. Group them into Semantic Roles. CRITICAL: Try your best to approximate the Hex Codes from looking at the image.
    *   **Backgrounds:** (Base canvas, containers)
    *   **Accents/Primary:** (Buttons, active states, key data trends)
    *   **Text/Typography:** (Headlines, body text, muted text)
    *   **Functional (if any):** (Success, Error, Warning colors)

    ## 3. Typography Rules
    Identify the likely font families (or suggest close matches like Inter, Roboto, Plus Jakarta Sans, etc.).
    Describe the hierarchy:
    *   **Display:** How are the largest numbers treated? (Weight, spacing)
    *   **Headlines:** Section titles.
    *   **Body/Labels:** Small text, table headers.

    ## 4. Geometry & Shape
    *   **Corner Radius:** Are elements sharp, subtly rounded (4-8px), or pill-shaped?
    *   **Borders:** Are there visible solid borders? Or is separation handled via background color shifts?

    ## 5. Depth & Elevation
    *   **Shadows:** Are there drop shadows? If so, are they hard/dark or soft/diffused ambient shadows?
    *   **Layering:** How are cards separated from the background?

    ## 6. Layout Principles
    *   Describe the use of padding and whitespace within cards.
    *   How is the navigation handled?
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-pro',
        contents=[img, prompt]
    )
    
    # Save the output
    with open(".stitch/extracted_design.md", "w", encoding="utf-8") as f:
        f.write(response.text)
        
    print("Analysis complete. Saved to .stitch/extracted_design.md")
    
except Exception as e:
    print(f"Error: {e}")

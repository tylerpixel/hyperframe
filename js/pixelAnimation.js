document.addEventListener("DOMContentLoaded", () => {
  const viewport = document.getElementById("viewport");
  const gridSize = 20; // Should match your CSS variable (--grid-size)
  const pixelCount = 500; // Number of continuously moving pixels
  const animationDuration = 1; // Duration of animations in seconds

  // Create continuously moving pixels on the grid
  for (let i = 0; i < pixelCount; i++) {
    const pixel = document.createElement("div");
    pixel.className = "pixel";
    viewport.appendChild(pixel);
    animatePixel(pixel);
  }

  // On viewport click, create explosion pixels that move along grid lines
  viewport.addEventListener("click", (event) => {
    // Adjust click coordinates relative to the viewport element
    const rect = viewport.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    // Create a random number of explosion pixels (between 5 and 14)
    const randomPixelCount = Math.floor(Math.random() * 10) + 5;
    for (let i = 0; i < randomPixelCount; i++) {
      const pixel = document.createElement("div");
      pixel.className = "pixel";
      viewport.appendChild(pixel);
      shootPixel(pixel, clickX, clickY);
    }
  });

  // Continually move a pixel along grid lines
  function animatePixel(pixel) {
    const startPosition = getRandomGridPosition();
    pixel.style.top = `${startPosition.top}px`;
    pixel.style.left = `${startPosition.left}px`;
    movePixel(pixel, startPosition);
  }

  // Move the pixel one grid cell in a random cardinal direction, then repeat
  function movePixel(pixel, position) {
    const direction = getRandomDirection();
    const nextPosition = getNextPosition(position, direction);

    const keyframes = [
      { transform: "translate(0, 0)" },
      {
        transform: `translate(${nextPosition.left - position.left}px, ${
          nextPosition.top - position.top
        }px)`,
      },
    ];

    const animation = pixel.animate(keyframes, {
      duration: animationDuration * 1000,
      easing: "linear",
    });

    animation.onfinish = () => {
      // Update the pixel's absolute position and animate again
      pixel.style.top = `${nextPosition.top}px`;
      pixel.style.left = `${nextPosition.left}px`;
      movePixel(pixel, nextPosition);
    };
  }

  // Animate an explosion pixel from the click position along a cardinal direction
  function shootPixel(pixel, startX, startY) {
    // Choose a random cardinal direction
    const directions = ["up", "down", "left", "right"];
    const randomDirection =
      directions[Math.floor(Math.random() * directions.length)];
    // Choose a random number of grid steps (for example, between 3 and 7 steps)
    const steps = Math.floor(Math.random() * 5) + 7;

    // Calculate the destination based on the chosen direction and steps
    let endX = startX;
    let endY = startY;

    switch (randomDirection) {
      case "up":
        endY = startY - steps * gridSize;
        break;
      case "down":
        endY = startY + steps * gridSize;
        break;
      case "left":
        endX = startX - steps * gridSize;
        break;
      case "right":
        endX = startX + steps * gridSize;
        break;
    }

    // Set initial position of the explosion pixel
    pixel.style.top = `${startY}px`;
    pixel.style.left = `${startX}px`;
    // Use CSS transitions for smooth movement and fading
    pixel.style.transition = `top ${animationDuration}s linear, left ${animationDuration}s linear, opacity ${animationDuration}s linear`;

    // Trigger the transition on the next frame
    requestAnimationFrame(() => {
      pixel.style.top = `${endY}px`;
      pixel.style.left = `${endX}px`;
      pixel.style.opacity = 0;
    });

    // Remove the pixel element after the animation completes
    setTimeout(() => {
      pixel.remove();
    }, animationDuration * 1000);
  }

  // Return a random grid-aligned position within the viewport
  function getRandomGridPosition() {
    const rows = Math.floor(viewport.clientHeight / gridSize);
    const cols = Math.floor(viewport.clientWidth / gridSize);
    const top = Math.floor(Math.random() * rows) * gridSize;
    const left = Math.floor(Math.random() * cols) * gridSize;
    return { top, left };
  }

  // Choose a random cardinal direction
  function getRandomDirection() {
    const directions = ["up", "down", "left", "right"];
    return directions[Math.floor(Math.random() * directions.length)];
  }

  // Calculate the next grid position given a starting position and a direction
  function getNextPosition(position, direction) {
    switch (direction) {
      case "up":
        return { top: position.top - gridSize, left: position.left };
      case "down":
        return { top: position.top + gridSize, left: position.left };
      case "left":
        return { top: position.top, left: position.left - gridSize };
      case "right":
        return { top: position.top, left: position.left + gridSize };
      default:
        return position;
    }
  }
});

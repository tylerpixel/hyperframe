document.addEventListener("DOMContentLoaded", () => {
  const texts = [
    { id: "terminal", text: "HYPERFRAME.COMPUTER", showCursor: false },
    {
      id: "description",
      text: "Hyperframe.computer is a simple, lightweight, and secure screen share app designed to be as intuitive as possible.",
      showCursor: true,
    },
  ];

  const delayBeforeStart = 1000; // milliseconds
  const typingDuration = 1000; // milliseconds total for typing

  texts.forEach((item, index) => {
    const element = document.getElementById(item.id);
    const text = item.text;
    const intervalTime = typingDuration / text.length;
    let charIndex = 0;

    const cursor = document.createElement("span");
    cursor.className = "cursor";
    cursor.textContent = "_";

    setTimeout(() => {
      const typeInterval = setInterval(() => {
        element.textContent += text[charIndex];
        charIndex++;
        if (charIndex === text.length) {
          clearInterval(typeInterval);
          if (item.showCursor) {
            element.appendChild(cursor);
          }
          if (item.id === "description") {
            document.getElementById("followButton").classList.add("drop-down");
          }
        }
      }, intervalTime);
    }, delayBeforeStart + index * typingDuration);
  });
});

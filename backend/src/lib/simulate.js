// One step of a simple random walk, used only when the live feed is unavailable.
// The sum of three uniforms, centred and scaled, approximates a standard normal.
export function stepPrice(price, rand = Math.random, volatility = 0.0006) {
  const z = (rand() + rand() + rand() - 1.5) / 0.5;
  const next = price * (1 + z * volatility);
  return next > 0 ? next : price;
}

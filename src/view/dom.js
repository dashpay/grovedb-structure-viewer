// Every node the viewer draws goes through here. Text is always set with
// textContent, never parsed as markup: the data may come from a fork.

const SVG = 'http://www.w3.org/2000/svg';

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (name === 'class') node.className = value;
    else if (name === 'text') node.textContent = value;
    else if (name === 'on') for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler);
    else if (name === 'data') for (const [key, data] of Object.entries(value)) node.dataset[key] = data;
    else if (name === 'style') for (const [key, css] of Object.entries(value)) node.style.setProperty(key, css);
    else node.setAttribute(name, value === true ? '' : String(value));
  }
  node.append(...children.filter((child) => child !== undefined && child !== null && child !== false));
  return node;
}

export function svg(tag, attributes = {}, ...children) {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  node.append(...children);
  return node;
}

export const icon = (name) => el('span', { class: `i i-${name}`, 'aria-hidden': 'true' });

export function clear(node) {
  node.replaceChildren();
  return node;
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Runs a Web Animation and resolves when it ends; instant when motion is
 * reduced. A hidden tab stops the animation clock, so a timer ends the wait
 * as well: navigation must never hang on a move nobody can see.
 */
export function animate(node, keyframes, options) {
  if (reducedMotion() || document.hidden) return Promise.resolve();
  const animation = node.animate(keyframes, { fill: 'both', ...options });
  const limit = (options.duration || 0) + (options.delay || 0) + 250;
  return new Promise((resolve) => {
    const finish = () => { animation.cancel(); resolve(); };
    const timer = setTimeout(finish, limit);
    animation.finished.then(() => { clearTimeout(timer); finish(); }, () => { clearTimeout(timer); resolve(); });
  });
}

export async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

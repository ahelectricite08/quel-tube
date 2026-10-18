/**
 * Tournée avec créneaux.
 * Le nœud 0 est le départ. Les arrêts 0..n-1 sont les nœuds 1..n.
 * Les heures sont des minutes depuis minuit. Un créneau vide vaut null.
 */

function leg(travelMin, fromNode, toNode) {
  const value = travelMin[fromNode]?.[toNode];
  if (value == null || Number.isNaN(value)) return 240;
  return Math.max(0, value);
}

function simulate(order, { travelMin, serviceMin, windowStart, windowEnd, departMin }) {
  let time = departMin;
  let prev = 0;
  const steps = [];
  let travelSum = 0;
  let lateMin = 0;
  for (const stop of order) {
    const node = stop + 1;
    const travel = leg(travelMin, prev, node);
    const arrive = time + travel;
    const open = windowStart[stop];
    const close = windowEnd[stop];
    const start = open == null ? arrive : Math.max(arrive, open);
    const wait = Math.max(0, start - arrive);
    const late = close == null ? 0 : Math.max(0, start - close);
    const end = start + serviceMin[stop];
    steps.push({ stop, travel, arrive, start, wait, late, end });
    travelSum += travel;
    lateMin += late;
    time = end;
    prev = node;
  }
  return { steps, travelSum, lateMin, endMin: time };
}

function cost(result) {
  const lateStops = result.steps.reduce((count, step) => count + (step.late > 0 ? 1 : 0), 0);
  return lateStops * 5000 + result.lateMin * 400 + result.travelSum + result.steps.reduce((sum, step) => sum + step.wait, 0) * 0.75;
}

function insertStop(order, stop, index) {
  const next = order.slice();
  next.splice(index, 0, stop);
  return next;
}

function relocate(order, from, to) {
  if (from === to) return order.slice();
  const next = order.slice();
  const [stop] = next.splice(from, 1);
  next.splice(to, 0, stop);
  return next;
}

function reverseSlice(order, start, end) {
  const next = order.slice();
  while (start < end) {
    const tmp = next[start];
    next[start] = next[end];
    next[end] = tmp;
    start += 1;
    end -= 1;
  }
  return next;
}

function improve(order, model) {
  let current = order.slice();
  let currentCost = cost(simulate(current, model));
  for (let pass = 0; pass < 25; pass += 1) {
    let changed = false;
    for (let from = 0; from < current.length; from += 1) {
      for (let to = 0; to < current.length; to += 1) {
        if (from === to) continue;
        const next = relocate(current, from, to);
        const nextCost = cost(simulate(next, model));
        if (nextCost + 0.05 < currentCost) {
          current = next;
          currentCost = nextCost;
          changed = true;
        }
      }
    }
    for (let start = 0; start < current.length; start += 1) {
      for (let end = start + 1; end < current.length; end += 1) {
        const next = reverseSlice(current, start, end);
        const nextCost = cost(simulate(next, model));
        if (nextCost + 0.05 < currentCost) {
          current = next;
          currentCost = nextCost;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return current;
}

export function placeAfter(model) {
  const minPos = model.minPos ?? 0;
  const free = model.free.slice().sort((a, b) => (model.windowEnd[a] ?? model.windowStart[a] ?? 1440) - (model.windowEnd[b] ?? model.windowStart[b] ?? 1440));
  let order = model.order.slice();
  for (const stop of free) {
    let bestOrder = insertStop(order, stop, minPos);
    let bestCost = cost(simulate(bestOrder, model));
    for (let index = minPos + 1; index <= order.length; index += 1) {
      const trial = insertStop(order, stop, index);
      const trialCost = cost(simulate(trial, model));
      if (trialCost < bestCost) {
        bestOrder = trial;
        bestCost = trialCost;
      }
    }
    order = bestOrder;
  }
  return improveFree(order, model, new Set(free), minPos);
}

function improveFree(order, model, freeSet, minPos) {
  let current = order.slice();
  let currentCost = cost(simulate(current, model));
  for (let pass = 0; pass < 25; pass += 1) {
    let changed = false;
    for (let from = minPos; from < current.length; from += 1) {
      if (!freeSet.has(current[from])) continue;
      for (let to = minPos; to < current.length; to += 1) {
        if (from === to) continue;
        const next = relocate(current, from, to);
        const nextCost = cost(simulate(next, model));
        if (nextCost + 0.05 < currentCost) {
          current = next;
          currentCost = nextCost;
          changed = true;
        }
      }
    }
    for (let start = minPos; start < current.length; start += 1) {
      for (let end = start + 1; end < current.length; end += 1) {
        let blocked = false;
        for (let index = start; index <= end; index += 1) if (!freeSet.has(current[index])) blocked = true;
        if (blocked) continue;
        const next = reverseSlice(current, start, end);
        const nextCost = cost(simulate(next, model));
        if (nextCost + 0.05 < currentCost) {
          current = next;
          currentCost = nextCost;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return current;
}

export function optimizeFree(model) {
  let current = model.order.slice();
  const locked = model.locked || new Set();
  let currentCost = cost(simulate(current, model));
  for (let pass = 0; pass < 30; pass += 1) {
    let changed = false;
    for (let left = 0; left < current.length; left += 1) {
      if (locked.has(current[left])) continue;
      for (let right = left + 1; right < current.length; right += 1) {
        if (locked.has(current[right])) continue;
        const next = current.slice();
        const swap = next[left];
        next[left] = next[right];
        next[right] = swap;
        const nextCost = cost(simulate(next, model));
        if (nextCost + 0.05 < currentCost) {
          current = next;
          currentCost = nextCost;
          changed = true;
        }
      }
    }
    for (let start = 0; start < current.length; start += 1) {
      for (let end = start + 1; end < current.length; end += 1) {
        let blocked = false;
        for (let index = start; index <= end; index += 1) if (locked.has(current[index])) blocked = true;
        if (blocked) continue;
        const next = reverseSlice(current, start, end);
        const nextCost = cost(simulate(next, model));
        if (nextCost + 0.05 < currentCost) {
          current = next;
          currentCost = nextCost;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return current;
}

export function planRoute(model) {
  const count = model.serviceMin.length;
  if (!count) return { order: [], steps: [], travelSum: 0, lateMin: 0, endMin: model.departMin };

  const constrained = [];
  const free = [];
  for (let stop = 0; stop < count; stop += 1) {
    if (model.windowStart[stop] != null || model.windowEnd[stop] != null) constrained.push(stop);
    else free.push(stop);
  }
  constrained.sort((a, b) => (model.windowEnd[a] ?? model.windowStart[a] ?? 1440) - (model.windowEnd[b] ?? model.windowStart[b] ?? 1440));
  free.sort((a, b) => leg(model.travelMin, 0, a + 1) - leg(model.travelMin, 0, b + 1));

  let order = [];
  for (const stop of [...constrained, ...free]) {
    let bestOrder = insertStop(order, stop, 0);
    let bestCost = cost(simulate(bestOrder, model));
    for (let index = 1; index <= order.length; index += 1) {
      const trial = insertStop(order, stop, index);
      const trialCost = cost(simulate(trial, model));
      if (trialCost < bestCost) {
        bestOrder = trial;
        bestCost = trialCost;
      }
    }
    order = bestOrder;
  }

  order = improve(order, model);
  const result = simulate(order, model);
  return { order, ...result };
}

export function travelMinutesFallback(from, to) {
  if (from.lat == null || to.lat == null) return 20;
  const earth = 6371;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const km = 2 * earth * Math.asin(Math.min(1, Math.sqrt(h)));
  if (km < 0.05) return 1;
  return Math.max(1, Math.round((km * 1.35 / 32) * 60));
}

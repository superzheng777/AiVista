export const BOTTOM_FOLLOW_THRESHOLD_PX = 160;

export function nextBottomFollowState(current: boolean, distanceFromBottom: number, isScrollingUp: boolean): boolean {
  if (distanceFromBottom <= BOTTOM_FOLLOW_THRESHOLD_PX) return true;
  if (isScrollingUp) return false;
  return current;
}

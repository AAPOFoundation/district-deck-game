// Choose a result that actually exists after the reducer has applied the walk.
// A parcel walk can meet several people; only the displayed person's toast is
// replaced by their persistent card. Other results still need their receipts.
export function meetingResultFocus(result, action) {
  if (result.rejected) return null;
  const people = result.state?.people?.byId ?? {};
  const events = result.events ?? [];
  const requested = action?.destination?.kind === 'person'
    ? action.destination.id
    : action?.personId;
  const personId = requested ?? (action?.type === 'walk'
    ? events.find(event => event.personId && !event.despawn && people[event.personId])?.personId
    : null);
  if (!personId) return null;
  const event = events.find(event => event.personId === personId) ?? null;
  return { personId, event, despawned: Boolean(event?.despawn || !people[personId]) };
}

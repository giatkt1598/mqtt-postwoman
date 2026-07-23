export function topicMatches(filter: string, topic: string) {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");
  for (let index = 0; index < filterParts.length; index += 1) {
    if (filterParts[index] === "#") return true;
    if (filterParts[index] === "+") {
      if (!topicParts[index]) return false;
      continue;
    }
    if (filterParts[index] !== topicParts[index]) return false;
  }
  return filterParts.length === topicParts.length;
}

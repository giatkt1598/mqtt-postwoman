export function topicMatches(filter: string, topic: string) {
  const filterParts = filter.split("/");
  const topicParts = topic.split("/");

  let i = 0;
  for (; i < filterParts.length; i += 1) {
    const filterPart = filterParts[i];
    const topicPart = topicParts[i];

    if (filterPart === "#") {
      return i === filterParts.length - 1;
    }

    if (filterPart === "+") {
      if (topicPart === undefined) return false;
      continue;
    }

    if (filterPart !== topicPart) {
      return false;
    }
  }

  return i === topicParts.length;
}


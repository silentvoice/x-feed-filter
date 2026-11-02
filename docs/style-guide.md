# Documentation style guide

All documents in this repository use the rules of [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/). STE makes the text clear for all readers, including readers whose first language is not English, and for translation tools.

This guide gives a summary of the rules that apply most often. It does not replace the official specification.

## Words

1. Use approved words with their approved meanings. For example, use "start", not "commence". Use "help", not "assist".
2. Use one word for one meaning. If you use "post", do not also use "tweet" for the same thing.
3. Technical names are permitted, for example "service worker", "WebGPU", and "content script".
4. Do not use the "-ing" form of a verb as a noun or an adjective, except in technical names.
5. Use only the simple forms of verbs: present, past, and future.

## Sentences

1. Keep a procedural sentence (an instruction) to 20 words or fewer.
2. Keep a descriptive sentence to 25 words or fewer.
3. Use the active voice. Write "The model gives a probability", not "A probability is given by the model".
4. Use articles ("a", "an", "the") where possible.
5. Do not use contractions. Write "do not", not "don't".

## Procedures

1. Write one instruction in each step.
2. Use the imperative form of the verb. Write "Open the settings page".
3. Use numbered steps.
4. If two actions occur at the same time, you can put them in one step.
5. Put a warning or a caution before the step that it applies to.

## Paragraphs

1. Write about one topic in each paragraph.
2. Use no more than six sentences in each paragraph.
3. Start with the most important information.

## Notes, cautions, and warnings

Use GitHub alerts:

- `> [!NOTE]` gives information that helps the reader.
- `> [!IMPORTANT]` gives information that the reader must know to complete a task.
- `> [!CAUTION]` tells the reader about a risk of damage to data, money, or legal status.

## Checklist for a pull request

- [ ] Each instruction has 20 words or fewer.
- [ ] Each descriptive sentence has 25 words or fewer.
- [ ] Each procedure uses numbered steps with one instruction for each step.
- [ ] The text uses the active voice.
- [ ] The text uses the same term for the same thing.
- [ ] The text has no contractions.

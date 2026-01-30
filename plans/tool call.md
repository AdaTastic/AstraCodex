I got this from an unprompted model

<tool_call>
{
  "name": "tool_name",
  "arguments": {
    "arg1": "value1",
    "arg2": "value2",
    ...
  }
}
</tool_call>
```

For example, if I need to use a tool to search for recent weather information, I would format it as:

```
<tool_call>
{
  "name": "search_weather",
  "arguments": {
    "city": "New York",
    "date": "2024-06-15"
  }
}
</tool_call>
```

lets just move over to using this forrmat only Ive reverted the changes
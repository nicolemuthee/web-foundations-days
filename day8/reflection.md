Reflection

The most difficult concept. The hardest concept was concurrency: two requests can read the same row at the same moment, and both believe the seat is free. Thinking one step at a time made transactions feel abstract. I overcame it by writing two users' queries side by side on paper and tracing them. That showed me the fix is not a faster check, but making "check and claim" a single atomic UPDATE, with a unique constraint as a safety net. Applying it to the ticketing problem made it stick.

What I would improve in my capstone. My capstone examines LLMs and Kenyan indigenous languages. Based on the feedback I received, I would improve the Findings and Discussion section. I would restructure it objective by objective, so that each section ends with a clear answer to the research objective it addresses. I would also apply APA 7th edition consistently and rewrite my transitions so the writing sounds like my own voice and reads naturally.

What I will learn next. I will keep building on the data side. I am continuing the Data Analyst in Python track on DataCamp, starting with data manipulation with pandas, alongside my Moringa course in Excel, SQL and Power BI. I also plan to finish Responsive Web Design on freeCodeCamp, so I can build and deploy small projects myself and understand the full path from a web page to its data.

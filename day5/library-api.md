# Library Books REST API

## Overview

A REST API for managing a library's books. Requests and responses use JSON.

## Book Object

- `id`: Unique book identifier (number)
- `title`: Book title (string)
- `author`: Author's name (string)
- `year`: Publication year (number)
- `isbn`: Book ISBN (string)

## Endpoints

### List Books

- **Method:** GET
- **Path:** `/books`
- **Success:** 200 OK
- Returns all books.

### Get One Book

- **Method:** GET
- **Path:** `/books/{id}`
- **Success:** 200 OK
- **Error:** 404 Not Found

### Create a Book

- **Method:** POST
- **Path:** `/books`
- **Body:** title, author, year, isbn
- **Success:** 201 Created

### Update a Book

- **Method:** PUT
- **Path:** `/books/{id}`
- **Body:** title, author, year, isbn
- **Success:** 200 OK
- **Error:** 404 Not Found

### Delete a Book

- **Method:** DELETE
- **Path:** `/books/{id}`
- **Success:** 204 No Content
- **Error:** 404 Not Found

### Filter by Author

- **Method:** GET
- **Path:** `/books?author={name}`
- **Success:** 200 OK
- Returns books written by the specified author.

## Error Responses

- **400 Bad Request:** The request is malformed or contains invalid book details.
- **404 Not Found:** The requested book does not exist.

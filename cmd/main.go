package main

import (
	"bufio"
	"errors"
	"fmt"
	"log"
	"math/rand"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/session"
	"github.com/valyala/fasthttp"
)

type Event struct {
	Type string
	Data string
}

type Session struct {
	Uid int64 `json:"id"`
}

type ClientEvent struct {
	From int64  `json:"from"`
	To   int64  `json:"to"`
	Type string `json:"type"`
	Data string `json:"data"`
}

var clients = map[int64]chan Event{}
var store *session.Store

func main() {
	app := fiber.New()
	api := app.Group("/api")
	api.Use(recover.New())
	store = session.New()
	store.RegisterType(Session{})

	app.Use(logger.New())

	api.Get("/register", func(c *fiber.Ctx) error {
		s, err := store.Get(c)
		if err != nil {
			return sendError(c, err)
		}

		var session interface{}
		if session = s.Get("session"); session == nil {
			newSession := Session{
				Uid: rand.Int63n(1_000_000),
			}
			log.Printf("new client: %d", newSession.Uid)
			clients[newSession.Uid] = make(chan Event, 5)
			s.Set("session", newSession)
			if err := s.Save(); err != nil {
				return sendError(c, err)
			}

			return c.JSON(newSession)
		}

		close(clients[session.(Session).Uid])
		clients[session.(Session).Uid] = make(chan Event, 5)
		log.Printf("client %d is back", session.(Session).Uid)
		return c.JSON(session.(Session))
	})

	api.Use("/unregister", func(c *fiber.Ctx) error {
		s, err := store.Get(c)
		if err != nil {
			return sendError(c, err)
		}

		var session interface{}
		if session = s.Get("session"); session != nil {
			close(clients[session.(Session).Uid])
			delete(clients, session.(Session).Uid)
			log.Printf("client %d left", session.(Session).Uid)
		}

		if err := s.Destroy(); err != nil {
			return sendError(c, err)
		}
		return c.SendString("done")
	})

	api.Get("/list", func(c *fiber.Ctx) error {
		keys := []int64{}
		for k := range clients {
			keys = append(keys, k)
		}
		return c.JSON(struct {
			List []int64 `json:"list"`
		}{
			keys,
		})
	})

	api.Get("/events", func(c *fiber.Ctx) error {
		session, err := getSession(c)
		if err != nil {
			return sendError(c, err)
		}

		clientChan, ok := clients[session.Uid]
		log.Printf("client %d listining for events", session.Uid)
		if !ok {
			return sendError(c, errors.New("unknown client"))
		}

		c.Set("Content-Type", "text/event-stream")
		c.Set("Cache-Control", "no-cache")
		c.Set("Connection", "keep-alive")

		c.Context().SetBodyStreamWriter(fasthttp.StreamWriter(func(w *bufio.Writer) {
			for evt := range clientChan {
				log.Printf("sending %s event to client %d: %s", evt.Type, session.Uid, evt.Data)
				fmt.Fprintf(w, "event: %s\n", evt.Type)
				fmt.Fprintf(w, "data: %s\n\n", evt.Data)
				if err := w.Flush(); err != nil {
					break
				}
			}
			log.Printf("client %d event stream ended", session.Uid)
		}))
		return nil
	})

	api.Post("/send", func(c *fiber.Ctx) error {
		_, err := getSession(c)
		if err != nil {
			return sendError(c, err)
		}

		data := ClientEvent{}
		if err := c.BodyParser(&data); err != nil {
			return sendError(c, err)
		}

		if data.From == 0 || data.To == 0 || data.Type == "" || data.Data == "" {
			return sendError(c, errors.New("invalid body"))
		}

		log.Printf("client %d sending %s to %d", data.From, data.Type, data.To)
		channel, ok := clients[data.To]
		if !ok {
			return sendError(c, errors.New("unknown receiver"))
		}
		channel <- Event{Type: data.Type, Data: data.Data}

		return c.SendStatus(200)
	})

	app.Static("/", "./dist/")

	log.Fatal(app.Listen(":4000"))
}

func sendError(c *fiber.Ctx, err error) error {
	return c.Status(fiber.StatusInternalServerError).SendString(fmt.Sprintf("{\"error\":\"%s\"}", err))
}

func getSession(c *fiber.Ctx) (Session, error) {
	s, err := store.Get(c)
	if err != nil {
		return Session{}, err
	}

	var session interface{}
	if session = s.Get("session"); session == nil {
		return Session{}, errors.New("session not found")
	}
	return session.(Session), nil
}

# Prototyping

## On this page

- [From concept to interface](#from-concept-to-interface)
- [Interface decisions](#interface-decisions)

## From concept to interface

The work began with an experiment in representing Java code through PSI and progressed to two-way editing between source and model. High-fidelity prototypes arranged the modeling workspace, explorer, library, properties, and history navigation. The current plugin concentrates IDE controls and configuration, while editing and history appear in the web interface.

The original diagrams remain in the thesis writing project. The thesis's Analysis and Design section presents their development. Screenshots of the executable interface will be added to the [manual](manual.md) after the demonstration session.

## Interface decisions

The library inserts Java components into the model. The properties panel edits a selected element. The history presents commits and individual events through code, model, and diff views. These controls provide a user interface for the structural records kept by the system. The [technical example](implementation.md) follows an operation into persisted data.

---

[← Implementation](implementation.md) · [Index](index.md) · [Evaluation →](evaluation.md) · [Português](../pt-BR/prototipacao.md)

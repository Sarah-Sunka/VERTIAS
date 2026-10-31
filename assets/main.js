/* =========================================================
   Veritas Intelligence — site behaviour
   Change the contact address in ONE place: CONTACT_EMAIL.
   ========================================================= */

(function () {
  "use strict";

  var CONTACT_EMAIL = "sarahfaisal2118@gmail.com";

  // Free key from https://web3forms.com/#start — tied to CONTACT_EMAIL.
  // While empty, the form falls back to preparing a draft in the visitor's email app.
  var WEB3FORMS_ACCESS_KEY = "";
  var FORM_ENDPOINT = "https://api.web3forms.com/submit";

  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Shared: contact address + year ---------- */

  document.querySelectorAll("[data-contact-email]").forEach(function (link) {
    link.href = "mailto:" + CONTACT_EMAIL;
    link.textContent = CONTACT_EMAIL;
  });

  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- Header shadow on scroll ---------- */

  var header = document.querySelector(".site-header");

  if (header) {
    var updateHeader = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
  }

  /* ---------- Mobile navigation ---------- */

  var navToggle = document.querySelector("[data-nav-toggle]");
  var siteNav = document.getElementById("site-nav");

  if (navToggle && siteNav) {
    var setNav = function (open) {
      siteNav.classList.toggle("is-open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    };

    navToggle.addEventListener("click", function () {
      setNav(navToggle.getAttribute("aria-expanded") !== "true");
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && siteNav.classList.contains("is-open")) {
        setNav(false);
        navToggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (
        siteNav.classList.contains("is-open") &&
        !siteNav.contains(event.target) &&
        !navToggle.contains(event.target)
      ) {
        setNav(false);
      }
    });

    siteNav.addEventListener("click", function (event) {
      if (event.target.closest("a") && window.matchMedia("(max-width: 860px)").matches) {
        setNav(false);
      }
    });

    var desktopQuery = window.matchMedia("(min-width: 861px)");
    var onDesktop = function (event) {
      if (event.matches) {
        setNav(false);
      }
    };

    if (typeof desktopQuery.addEventListener === "function") {
      desktopQuery.addEventListener("change", onDesktop);
    } else if (typeof desktopQuery.addListener === "function") {
      desktopQuery.addListener(onDesktop);
    }
  }

  /* ---------- Reveal on scroll ---------- */

  var revealElements = document.querySelectorAll(".reveal");

  if (revealElements.length) {
    if (!("IntersectionObserver" in window) || reducedMotion) {
      revealElements.forEach(function (el) {
        el.classList.add("is-visible");
      });
    } else {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              observer.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
      );

      revealElements.forEach(function (el) {
        observer.observe(el);
      });
    }
  }

  /* ---------- Contact form ---------- */

  var form = document.getElementById("contact-form");

  if (form) {
    var topicLabels = {
      briefing: "Request a briefing",
      partnership: "Partnership",
      press: "Press enquiry",
      security: "Security disclosure",
      other: "Something else"
    };

    var fields = {
      name: {
        input: document.getElementById("name"),
        error: document.getElementById("name-error"),
        message: "Please enter your name.",
        valid: function (value) { return value.trim().length >= 2; }
      },
      email: {
        input: document.getElementById("email"),
        error: document.getElementById("email-error"),
        message: "Enter a valid email address, like name@company.com.",
        valid: function (value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim()); }
      },
      organization: {
        input: document.getElementById("organization"),
        error: null,
        valid: function () { return true; }
      },
      topic: {
        input: document.getElementById("topic"),
        error: document.getElementById("topic-error"),
        message: "Choose a topic so we can route your message.",
        valid: function (value) { return value !== ""; }
      },
      message: {
        input: document.getElementById("message"),
        error: document.getElementById("message-error"),
        message: "Please add at least 20 characters so we know how to help.",
        valid: function (value) { return value.trim().length >= 20; }
      }
    };

    var result = document.getElementById("form-result");
    var resultEmail = document.getElementById("result-email");
    var resultTitle = document.getElementById("result-title");
    var resultDraftCopy = document.getElementById("result-draft-copy");
    var resultSuccessCopy = document.getElementById("result-success-copy");
    var resultName = document.getElementById("result-name");
    var draftSection = document.getElementById("draft-section");
    var draftPreview = document.getElementById("draft-preview");
    var mailtoLink = document.getElementById("mailto-link");
    var copyButton = document.getElementById("copy-message");
    var copyStatus = document.getElementById("copy-status");
    var resultHeading = document.getElementById("result-heading");
    var resultActions = document.getElementById("result-actions");
    var sendAnother = document.getElementById("send-another");
    var formError = document.getElementById("form-error");
    var submitButton = form.querySelector('button[type="submit"]');
    var submitLabel = document.getElementById("submit-label");
    var botcheck = document.getElementById("botcheck");
    var currentDraft = null;

    var setFieldError = function (key, show) {
      var field = fields[key];
      if (!field || !field.input || !field.error) {
        return;
      }

      field.error.hidden = !show;
      if (show) {
        field.error.textContent = field.message || "Please check this field.";
        field.input.setAttribute("aria-invalid", "true");
      } else {
        field.input.removeAttribute("aria-invalid");
      }
    };

    var clearResult = function () {
      if (result && !result.hidden) {
        result.hidden = true;
        if (copyStatus) {
          copyStatus.textContent = "";
          copyStatus.classList.remove("is-error");
        }
        currentDraft = null;
      }
    };

    var clearFormError = function () {
      if (formError) {
        formError.hidden = true;
      }
    };

    Object.keys(fields).forEach(function (key) {
      var field = fields[key];
      if (!field.input) {
        return;
      }
      var eventName = field.input.tagName === "SELECT" ? "change" : "input";
      field.input.addEventListener(eventName, function () {
        if (field.input.getAttribute("aria-invalid") === "true" && field.valid(field.input.value)) {
          setFieldError(key, false);
        }
        clearFormError();
        if (result && !result.hidden) {
          clearResult();
        }
      });
    });

    var buildDraft = function () {
      var topic = fields.topic.input.value;
      var topicLabel = topicLabels[topic] || "General enquiry";
      var subject = "Briefing request — " + topicLabel;
      var lines = ["Name: " + fields.name.input.value.trim(), "Email: " + fields.email.input.value.trim()];

      var organization = fields.organization.input.value.trim();
      if (organization) {
        lines.push("Organization: " + organization);
      }

      lines.push("Topic: " + topicLabel);
      lines.push("");
      lines.push("Message:");
      lines.push(fields.message.input.value.trim());

      var body = lines.join("\r\n");
      var text = "To: " + CONTACT_EMAIL + "\r\nSubject: " + subject + "\r\n\r\n" + body;

      return {
        subject: subject,
        topicLabel: topicLabel,
        body: body,
        text: text,
        mailto:
          "mailto:" +
          CONTACT_EMAIL +
          "?subject=" +
          encodeURIComponent(subject) +
          "&body=" +
          encodeURIComponent(body)
      };
    };

    var revealResult = function () {
      if (!result) {
        return;
      }
      result.hidden = false;
      if (resultHeading) {
        resultHeading.focus({ preventScroll: true });
      }
      result.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest"
      });
    };

    var showDraftResult = function (draft) {
      currentDraft = draft;
      if (resultTitle) {
        resultTitle.textContent = "Your message is ready.";
      }
      if (resultDraftCopy) {
        resultDraftCopy.hidden = false;
      }
      if (resultSuccessCopy) {
        resultSuccessCopy.hidden = true;
      }
      if (draftSection) {
        draftSection.hidden = false;
      }
      if (resultActions) {
        resultActions.hidden = true;
      }
      if (draftPreview) {
        draftPreview.value = draft.text.replace(/\r\n/g, "\n");
      }
      if (mailtoLink) {
        mailtoLink.href = draft.mailto;
      }
      if (resultEmail) {
        resultEmail.textContent = CONTACT_EMAIL;
      }
      if (copyStatus) {
        copyStatus.textContent = "";
        copyStatus.classList.remove("is-error");
      }
      revealResult();
    };

    var showSentResult = function (name) {
      currentDraft = null;
      if (resultTitle) {
        resultTitle.textContent = "Message sent.";
      }
      if (resultDraftCopy) {
        resultDraftCopy.hidden = true;
      }
      if (resultSuccessCopy) {
        resultSuccessCopy.hidden = false;
      }
      if (resultName) {
        resultName.textContent = name;
      }
      if (draftSection) {
        draftSection.hidden = true;
      }
      if (resultActions) {
        resultActions.hidden = false;
      }
      if (copyStatus) {
        copyStatus.textContent = "";
        copyStatus.classList.remove("is-error");
      }
      revealResult();
    };

    var showFormError = function () {
      if (!formError) {
        return;
      }
      formError.hidden = false;
      formError.focus({ preventScroll: true });
      formError.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest"
      });
    };

    var setSending = function (sending) {
      if (submitButton) {
        submitButton.disabled = sending;
        submitButton.setAttribute("aria-busy", sending ? "true" : "false");
      }
      if (submitLabel) {
        submitLabel.textContent = sending ? "Sending…" : "Send message";
      }
    };

    var sendMessage = function (draft) {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = controller
        ? window.setTimeout(function () { controller.abort(); }, 15000)
        : null;

      var finish = function () {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        setSending(false);
      };

      var payload = {
        access_key: WEB3FORMS_ACCESS_KEY,
        subject: draft.subject,
        from_name: "Veritas website",
        replyto: fields.email.input.value.trim(),
        name: fields.name.input.value.trim(),
        email: fields.email.input.value.trim(),
        organization: fields.organization.input.value.trim(),
        topic: draft.topicLabel,
        message: fields.message.input.value.trim(),
        botcheck: false
      };

      setSending(true);

      fetch(FORM_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (response) {
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok || !data.success) {
              throw new Error("Send failed");
            }
            return data;
          });
        })
        .then(function () {
          showSentResult(payload.name);
        })
        .catch(function () {
          showFormError();
        })
        .then(finish);
    };

    if (sendAnother) {
      sendAnother.addEventListener("click", function () {
        form.reset();
        Object.keys(fields).forEach(function (key) {
          setFieldError(key, false);
        });
        clearResult();
        clearFormError();
        setSending(false);
        fields.name.input.focus();
        form.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start"
        });
      });
    }

    var copyText = function (text) {
      if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(
          function () { return true; },
          function () { return legacyCopy(text); }
        );
      }
      return Promise.resolve(legacyCopy(text));
    };

    var legacyCopy = function (text) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-1000px";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();

      var succeeded = false;
      try {
        succeeded = document.execCommand("copy");
      } catch (error) {
        succeeded = false;
      }

      area.remove();
      return succeeded;
    };

    if (copyButton) {
      copyButton.addEventListener("click", function () {
        if (!currentDraft) {
          return;
        }

        var setStatus = function (message, isError) {
          if (!copyStatus) {
            return;
          }
          copyStatus.textContent = message;
          copyStatus.classList.toggle("is-error", Boolean(isError));
        };

        copyText(currentDraft.text).then(function (ok) {
          if (ok) {
            setStatus("Message copied. Paste it into any email app.", false);
            copyButton.textContent = "Copied";
            window.setTimeout(function () {
              copyButton.textContent = "Copy message";
            }, 2400);
          } else {
            setStatus("Copying was blocked by your browser. Select the preview above and copy it manually.", true);
          }
        });
      });
    }

    var params = new URLSearchParams(window.location.search);
    var requestedTopic = params.get("topic");
    if (requestedTopic && Object.prototype.hasOwnProperty.call(topicLabels, requestedTopic)) {
      fields.topic.input.value = requestedTopic;
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (submitButton && submitButton.disabled) {
        return;
      }

      clearResult();
      clearFormError();

      var firstInvalid = null;

      Object.keys(fields).forEach(function (key) {
        var field = fields[key];
        if (!field.input || !field.error) {
          return;
        }
        var ok = field.valid(field.input.value);
        setFieldError(key, !ok);
        if (!ok && !firstInvalid) {
          firstInvalid = field.input;
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      if (botcheck && botcheck.checked) {
        showSentResult(fields.name.input.value.trim());
        return;
      }

      var draft = buildDraft();

      if (!WEB3FORMS_ACCESS_KEY) {
        showDraftResult(draft);
        return;
      }

      sendMessage(draft);
    });
  }

  /* ---------- Investigation console ---------- */

  var investigationForm = document.getElementById("investigation-form");

  if (investigationForm) {
    var investigationQuestion = document.getElementById("investigation-question");
    var investigationError = document.getElementById("investigation-error");
    var investigationRequestError = document.getElementById("investigation-request-error");
    var investigationRequestMessage = document.getElementById("investigation-request-message");
    var investigationLoading = document.getElementById("investigation-loading");
    var investigationResult = document.getElementById("investigation-result");
    var investigationReport = document.getElementById("investigation-report");
    var investigationResultHeading = document.getElementById("investigation-result-heading");
    var investigationTimestamp = document.getElementById("investigation-timestamp");
    var investigationButton = document.getElementById("start-investigation");
    var investigationButtonLabel = document.getElementById("investigation-submit-label");
    var newInvestigationButton = document.getElementById("new-investigation");
    var investigationSending = false;
    var MIN_QUESTION_LENGTH = 10;
    var MAX_QUESTION_LENGTH = 2000;

    var setInvestigationError = function (message) {
      if (!investigationError) {
        return;
      }
      investigationError.hidden = !message;
      investigationError.textContent = message || "";
      if (message) {
        investigationQuestion.setAttribute("aria-invalid", "true");
      } else {
        investigationQuestion.removeAttribute("aria-invalid");
      }
    };

    var clearInvestigationRequestError = function () {
      if (investigationRequestError) {
        investigationRequestError.hidden = true;
      }
    };

    var showInvestigationRequestError = function (message) {
      if (!investigationRequestError) {
        return;
      }
      if (investigationRequestMessage) {
        investigationRequestMessage.textContent = message;
      }
      investigationRequestError.hidden = false;
      investigationRequestError.focus({ preventScroll: true });
      investigationRequestError.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest"
      });
    };

    var setInvestigationSending = function (sending) {
      investigationSending = sending;
      if (investigationButton) {
        investigationButton.disabled = sending;
        investigationButton.setAttribute("aria-busy", sending ? "true" : "false");
      }
      if (investigationButtonLabel) {
        investigationButtonLabel.textContent = sending ? "Investigating…" : "Start Investigation";
      }
      investigationForm.setAttribute("aria-busy", sending ? "true" : "false");
      if (investigationLoading) {
        investigationLoading.hidden = !sending;
      }
    };

    var showInvestigationResult = function (report, receivedAt) {
      if (!investigationResult) {
        return;
      }
      if (investigationReport) {
        investigationReport.textContent = report;
      }
      if (investigationTimestamp) {
        var date = receivedAt ? new Date(receivedAt) : new Date();
        investigationTimestamp.textContent = isNaN(date.getTime())
          ? ""
          : "Received " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      investigationResult.hidden = false;
      if (investigationResultHeading) {
        investigationResultHeading.focus({ preventScroll: true });
      }
      investigationResult.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest"
      });
    };

    investigationQuestion.addEventListener("input", function () {
      if (investigationQuestion.getAttribute("aria-invalid") === "true") {
        setInvestigationError("");
      }
      clearInvestigationRequestError();
    });

    if (newInvestigationButton) {
      newInvestigationButton.addEventListener("click", function () {
        investigationForm.reset();
        setInvestigationError("");
        clearInvestigationRequestError();
        if (investigationResult) {
          investigationResult.hidden = true;
        }
        if (investigationReport) {
          investigationReport.textContent = "";
        }
        if (investigationTimestamp) {
          investigationTimestamp.textContent = "";
        }
        setInvestigationSending(false);
        investigationQuestion.focus();
        investigationForm.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start"
        });
      });
    }

    investigationForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (investigationSending) {
        return;
      }

      clearInvestigationRequestError();
      var question = investigationQuestion.value.trim();

      if (question.length < MIN_QUESTION_LENGTH) {
        setInvestigationError("Please enter at least 10 characters so the agents have enough context.");
        investigationQuestion.focus();
        return;
      }
      if (question.length > MAX_QUESTION_LENGTH) {
        setInvestigationError("Please shorten your question to 2,000 characters or fewer.");
        investigationQuestion.focus();
        return;
      }

      setInvestigationError("");

      if (investigationResult) {
        investigationResult.hidden = true;
      }

      setInvestigationSending(true);

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = controller
        ? window.setTimeout(function () { controller.abort(); }, 65000)
        : null;

      try {
        var response = await fetch("/api/investigate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ question: question }),
          signal: controller ? controller.signal : undefined
        });

        var data = null;
        try {
          data = await response.json();
        } catch (error) {
          data = null;
        }

        if (!response.ok) {
          var message = data && typeof data.error === "string" ? data.error : "";
          if (!message) {
            if (response.status === 504) {
              message = "The investigation took too long. Try a narrower question or try again.";
            } else if (response.status === 503) {
              message = "The investigation service is not configured yet.";
            } else if (response.status === 429) {
              message = "Too many investigations are running. Please wait a moment and try again.";
            } else {
              message = "The investigation service is temporarily unavailable. Please try again.";
            }
          }
          var serverError = new Error(message);
          serverError.fromServer = true;
          throw serverError;
        }

        if (!data || data.ok !== true || typeof data.report !== "string" || !data.report.trim()) {
          var emptyError = new Error("The investigation finished without a readable report. Please try again.");
          emptyError.fromServer = true;
          throw emptyError;
        }

        showInvestigationResult(data.report, data.receivedAt);
      } catch (error) {
        var failureMessage =
          "We couldn't reach the investigation service. Check your connection and try again.";

        if (error && error.name === "AbortError") {
          failureMessage = "The investigation took too long. Try a narrower question or try again.";
        } else if (error && error.fromServer && error.message) {
          failureMessage = error.message;
        }

        showInvestigationRequestError(failureMessage);
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        setInvestigationSending(false);
      }
    });
  }

  /* ---------- Briefing console ---------- */

  var briefingForm = document.getElementById("briefing-form");

  if (briefingForm) {
    var briefingTopic = document.getElementById("briefing-topic");
    var briefingError = document.getElementById("briefing-error");
    var briefingRequestError = document.getElementById("briefing-request-error");
    var briefingRequestMessage = document.getElementById("briefing-request-message");
    var briefingLoading = document.getElementById("briefing-loading");
    var briefingResult = document.getElementById("briefing-result");
    var briefingReport = document.getElementById("briefing-report");
    var briefingResultHeading = document.getElementById("briefing-result-heading");
    var briefingTimestamp = document.getElementById("briefing-timestamp");
    var briefingButton = document.getElementById("get-briefing");
    var briefingButtonLabel = document.getElementById("briefing-submit-label");
    var newBriefingButton = document.getElementById("new-briefing");
    var briefingSending = false;
    var MIN_TOPIC_LENGTH = 10;
    var MAX_TOPIC_LENGTH = 2000;

    var setBriefingError = function (message) {
      if (!briefingError) {
        return;
      }
      briefingError.hidden = !message;
      briefingError.textContent = message || "";
      if (message) {
        briefingTopic.setAttribute("aria-invalid", "true");
      } else {
        briefingTopic.removeAttribute("aria-invalid");
      }
    };

    var clearBriefingRequestError = function () {
      if (briefingRequestError) {
        briefingRequestError.hidden = true;
      }
    };

    var showBriefingRequestError = function (message) {
      if (!briefingRequestError) {
        return;
      }
      if (briefingRequestMessage) {
        briefingRequestMessage.textContent = message;
      }
      briefingRequestError.hidden = false;
      briefingRequestError.focus({ preventScroll: true });
      briefingRequestError.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest"
      });
    };

    var setBriefingSending = function (sending) {
      briefingSending = sending;
      if (briefingButton) {
        briefingButton.disabled = sending;
        briefingButton.setAttribute("aria-busy", sending ? "true" : "false");
      }
      if (briefingButtonLabel) {
        briefingButtonLabel.textContent = sending ? "Generating…" : "Get Briefing";
      }
      briefingForm.setAttribute("aria-busy", sending ? "true" : "false");
      if (briefingLoading) {
        briefingLoading.hidden = !sending;
      }
    };

    var showBriefingResult = function (briefing, receivedAt) {
      if (!briefingResult) {
        return;
      }
      if (briefingReport) {
        briefingReport.textContent = briefing;
      }
      if (briefingTimestamp) {
        var date = receivedAt ? new Date(receivedAt) : new Date();
        briefingTimestamp.textContent = isNaN(date.getTime())
          ? ""
          : "Received " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      }
      briefingResult.hidden = false;
      if (briefingResultHeading) {
        briefingResultHeading.focus({ preventScroll: true });
      }
      briefingResult.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest"
      });
    };

    briefingTopic.addEventListener("input", function () {
      if (briefingTopic.getAttribute("aria-invalid") === "true") {
        setBriefingError("");
      }
      clearBriefingRequestError();
    });

    if (newBriefingButton) {
      newBriefingButton.addEventListener("click", function () {
        briefingForm.reset();
        setBriefingError("");
        clearBriefingRequestError();
        if (briefingResult) {
          briefingResult.hidden = true;
        }
        if (briefingReport) {
          briefingReport.textContent = "";
        }
        if (briefingTimestamp) {
          briefingTimestamp.textContent = "";
        }
        setBriefingSending(false);
        briefingTopic.focus();
        briefingForm.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start"
        });
      });
    }

    var pageParams = new URLSearchParams(window.location.search);
    if (pageParams.get("topic") === "briefing") {
      briefingForm.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "start"
      });
      briefingTopic.focus({ preventScroll: true });
    }

    briefingForm.addEventListener("submit", async function (event) {
      event.preventDefault();

      if (briefingSending) {
        return;
      }

      clearBriefingRequestError();
      var topic = briefingTopic.value.trim();

      if (topic.length < MIN_TOPIC_LENGTH) {
        setBriefingError("Please enter at least 10 characters so the agent has enough context.");
        briefingTopic.focus();
        return;
      }
      if (topic.length > MAX_TOPIC_LENGTH) {
        setBriefingError("Please shorten your topic to 2,000 characters or fewer.");
        briefingTopic.focus();
        return;
      }

      setBriefingError("");

      if (briefingResult) {
        briefingResult.hidden = true;
      }

      setBriefingSending(true);

      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timeoutId = controller
        ? window.setTimeout(function () { controller.abort(); }, 65000)
        : null;

      try {
        var response = await fetch("/api/briefing", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({ topic: topic }),
          signal: controller ? controller.signal : undefined
        });

        var data = null;
        try {
          data = await response.json();
        } catch (error) {
          data = null;
        }

        if (!response.ok) {
          var message = data && typeof data.error === "string" ? data.error : "";
          if (!message) {
            if (response.status === 504) {
              message = "The briefing took too long. Try a narrower topic or try again.";
            } else if (response.status === 503) {
              message = "The briefing service is not configured yet.";
            } else if (response.status === 429) {
              message = "Too many requests. Please wait a moment and try again.";
            } else {
              message = "The briefing service is temporarily unavailable. Please try again.";
            }
          }
          var serverError = new Error(message);
          serverError.fromServer = true;
          throw serverError;
        }

        if (!data || data.ok !== true || typeof data.briefing !== "string" || !data.briefing.trim()) {
          var emptyError = new Error("The briefing finished without readable content. Please try again.");
          emptyError.fromServer = true;
          throw emptyError;
        }

        showBriefingResult(data.briefing, data.receivedAt);
      } catch (error) {
        var failureMessage =
          "We couldn't reach the briefing service. Check your connection and try again.";

        if (error && error.name === "AbortError") {
          failureMessage = "The briefing took too long. Try a narrower topic or try again.";
        } else if (error && error.fromServer && error.message) {
          failureMessage = error.message;
        }

        showBriefingRequestError(failureMessage);
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        setBriefingSending(false);
      }
    });
  }
})();

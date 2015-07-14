/*

Behaviour
=========

- Escape key:
  * removes beacon (but does not deactivate)
  * cancels action if we're currently "acting"

- Space key:
  * runs primary action if hasPrimary is true

- Return key:
  * does nothing if manualReturn = true
  * if control is a descendent of a <form>, submits form
  * otherwise, runs primary action if hasPrimary is true

- All controls need to have a single "target" element, e.g.
    input, anchor, button, textarea, etc.
  This is where we place callbacks, `tabindex`, `disabled`, etc.
  Controls may have other elements which can accept input, but these have no
  tabindex, and users of the control cannot pass properties to them

- All controls should define their own way of passing out a value to the outside
  world, e.g. onClick, onInput, etc. In the case that controlPrimaryAction exists,
  this should be where it happens.


State
=====

- active: currently accepting input
  * corresponds to browser "focus"
- beacon: draw attention to input
  * turned on when the element is made active via keyboard (i.e. via tabbing)
  * turned off when element is inactivated or `selecting` goes from false -> true
  * temporarily turned off while "acting" is true
- selecting: user is selecting the input via mouse/touch
  * cannot become true when control is disabled
  * invariant: control is active when selecting goes from true -> false except if disabled
- acting: user is indicating that they'd like to carry out the primary action
  * bound to the space key unless `manualSpace` is true or `actionless` is true
  * bound to the return key if not a child of a <form> element, unless `maunalReturn`
    or `actionless` is true
  * triggered selection if `actOnSelect` is true
  * cannot become true when control is disabled
  * `Base.on 'action'` callback will be called when `acting` goes from true -> false
  * startActing/finishActing/cancelActing can be manually called by inheriting class
- disabled: element cannot be selecting/acting
  * cannot be applied (but element can become active/show a beacon)

*/


import React, {Component, PropTypes} from "react"
import base from "react-base"
import invariant from "invariant"


const beaconWasEnabled = Symbol()
const finish = Symbol()
const start = Symbol()
const oldBase = Symbol()


const controlStateShape =
  PropTypes.shape({
    active: PropTypes.bool,
    beacon: PropTypes.bool,
    hover: PropTypes.bool,
    acting: PropTypes.bool,
    selecting: PropTypes.oneOfType([PropTypes.object, PropTypes.bool]),
    disabled: PropTypes.bool,
  }).isRequired


const KeyCodes = {
  ESC: 27,
  ENTER: 13,
  SPACE: 32,
  TAB: 9,
}



let tabPressed = false


if (window.addEventListener) {
  window.addEventListener('keydown', e => {
    if (e.keyCode == KeyCodes.TAB) {
      tabPressed = true
    }
  })
  window.addEventListener('keyup', e => {
    tabPressed = false
  })
}


baseControl.on = base.on
export default function baseControl(prefix, {passthrough, manualReturn} = {}) {
  return function decorator(component) {
    if (component.prototype.control !== undefined) {
      throw new Error("@control applied to a component which already has a `control` property")
    }

    base(prefix, {passthrough})(component)

    component.contextTypes = component.contextTypes || {}
    component.contextTypes.controlState = controlStateShape
    component.contextTypes.setControlState = PropTypes.func

    component.prototype[start] = function(selecting) {
      if (!this.control.disabled) {
        // Use null instead of false for the beacon, so we can tell if it is
        // disabled by blur/pointer/escape key before keyup
        this.context.setControlState({
          acting: !!this.controlPrimaryAction,
          beacon: !selecting && this.control.beacon ? null : false,
          selecting: selecting,
        })
      }
    }

    component.prototype[finish] = function() {
      if (this.acting == true && this.controlPrimaryAction) {
        this.controlPrimaryAction()
      }

      this.context.setControlState({
        acting: false,
        beacon: this.control.beacon || this.control.beacon === null,
        selecting: false,
      })
    }

    component.on('keydown', function(e) {
      switch (e.keyCode) {
        case KeyCodes.ENTER:
          // TODO: if we're a child of a form, submit it and break -
          // otherwise fall through
          break

        case KeyCodes.SPACE:
          this[startActing](false)
          break

        case KeyCodes.ESC:
          this.context.setControlState({
            beacon: false,
            selecting: false,
            acting: false,
          })
          break
      }
    })

    component.on('keyup', function(e) {
      switch (e.keyCode) {
        case KeyCodes.ENTER:
          // TODO: if we're a child of a form, submit it and break -
          // otherwise fall through
          break

        case KeyCodes.SPACE:
          this[finish]()
          break
      }
    })

    component.on('mouseEnter', function(e) {
      this.context.setControlState({hover: true})
    })

    component.on('mouseLeave', function(e) {
      this.context.setControlState({hover: false})
    })

    component.on(['mouseDown', 'touchStart'], function(e) {
      if (e.button === 0 || e.button === undefined) {
        this[start](e)
      }
    })

    component.on(['mouseUp', 'mouseOut', 'touchEnd'], function(e) {
      this[finish]()
    })

    component.on('blur', function(e) {
      this.context.setControlState({beacon: false, active: false})
    })

    component.on('focus', function(e) {
      if (tabPressed) {
        this.context.setControlState({beacon: true})
      }
      this.context.setControlState({active: true})
    })

    Object.defineProperty(component.prototype, 'control', {
      get: function() {
        return this.context.controlState
      },
      enumerable: true,
    })

    component.prototype[oldBase] = component.prototype.base
    component.prototype.base = function({classes, callbacks, passthrough = {}} = {}) {
      passthrough.force = passthrough.force || []
      passthrough.force.push('disabled', 'tabindex', 'form')

      return this[oldBase]({classes, callbacks, passthrough})
    }

    // Hide our state in a wrapper component so as to not intefere with anything
    // in the original component. Pass it through as context on a symbol only
    // known to us.
    return class extends Component {
      static propTypes = {
        disabled: PropTypes.bool,
      }

      static childContextTypes = {
        controlState: controlStateShape,
        setControlState: PropTypes.func,
      }

      state = {
        active: false,
        beacon: false,
        hover: false,
        acting: false,
        selecting: null,
        disabled: !!this.props.disabled,
      }
      
      getChildContext() {
        return {
          controlState: this.state,
          setControlState: this.setState.bind(this),
        }
      }

      render() {
        return React.createElement(component, this.props, this.props.children)
      }
    }
  }
}
